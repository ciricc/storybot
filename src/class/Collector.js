const easyvk = require('easyvk')

const Utils = require('./Utils')


class Collector {
  
  constructor (tokens = []) {

    this.tokens = {
      active: 0
    }

    this.userTokens = []
    this.groupIds = []
    this.activeGroup = 0

    this.groupsCursor = {}
    
    this.cacheGroups = []


    this._log = Function()
     
    tokens.forEach(token => {
      if (token) {
        this.createToken(token)
      }
    }, this)

    let self = this;


    this.easyVKMiddleWare = async ({thread, next}) => {
          
      if (!self.tokens[thread.query.access_token]) {
        thread.query.access_token = self.userTokens[self.tokens.active] || self.userTokens[0]
      }

      async function checkTokens () {
        let currentToken = self.tokens[thread.query.access_token];
        if (currentToken.perSecondMaked >= 3 && new Date().getTime() - currentToken.secondStarted < 1000) {
          // МЕняем токен, потому что уже сделано более 3 запросов за секунду
          
          self.tokens.active -= -1
          
          if (self.tokens.active >= self.userTokens.length) {
            self.tokens.active = 0
          }

          if (self.userTokens[self.tokens.active]) {
            self._log('Token changed... to ' + self.tokens.active)
            thread.query.access_token = self.userTokens[self.tokens.active]
          }

          let waitThisToken = (self.tokens[self.userTokens[self.tokens.active]].secondStarted + 1000) - new Date().getTime();
          if (waitThisToken < 0) waitThisToken = 0

          self._log('Waiting...', waitThisToken)
          await Utils.sleep(waitThisToken)
          await checkTokens()
        }
      }

      await checkTokens()

      let tokenObj = self.tokens[thread.query.access_token]

      tokenObj.perSecondMaked += 1;
      
      if (tokenObj.perSecondMaked >= 4) {
        tokenObj.perSecondMaked = 1;
      }

      if (tokenObj.perSecondMaked === 1) {
        tokenObj.secondStarted = new Date().getTime()
      }

      tokenObj.lastTimeRequest = new Date().getTime()
      self._log('Request completed!')
      await next()
    }

  }

  createToken (token) {

    this.userTokens.push(token)

    this.tokens[token] = {
      lastRequest: {},
      lastTimeRequest: 0,
      perSecondMaked: 0,
      secondStarted: 0
    }
  }

  async run () {

    let vk = await easyvk({
      save_session: false,
      reauth: true
    })
    
    this._vk = vk
    this._vk.use(this.easyVKMiddleWare, console.error)
    
    this.groups = this.db.collection('groups')


    return this._runCollectingStories()
  }

  async _runCollectingStories () {
    
    let self = this

    await Utils.asyncLoop(self.groupIds.length, async (loop) => {
      let groupId = self.groupIds[loop.iteration]

      let count = await self.groups.countDocuments({
        "group_id": groupId
      })

      if (!count) {
        self._log('Adding new group to database ...')

        await self.groups.insertOne({
          "group_id": groupId,
          "offset": 0,
          "count_of_stories": 0,
          "last_check_time": 0
        });
      }

      loop.next()

    })

    self._groupsCursor = await self.groups.find(self.constructQueryGetAllMyGroups())

    await self._groupsCursor.forEach(group => {
      self.groupsCursor[group.group_id] = group
    })


    self._log('Groups was checked!')
    
    return self._getNewStories()
  }

  constructQueryGetAllMyGroups () {
    let obj = {
      $or: []
    }

    this.groupIds.forEach((gid) => {
      obj.$or.push({
        "group_id": gid
      })
    })

    return obj;
  }

  async _getNewStories () {
    let offset = 0;
    
    let self = this

    if (!this.activeGroup) this.activeGroup = this.groupIds[0]

    offset = this.groupsCursor[this.activeGroup].offset

    let execs = [];


    this._vk.post('execute', {
      code: `var gid = ${this.activeGroup};var i = 0;
var offsetStart = ${offset};
var members = [];
while (i < 25) { members.push(API.groups.getMembers({            "group_id": gid,
"sort": "id_desc",
"offset": offsetStart + i * 1000,
"count": 1000}));          i = i + 1;        }       return members;`,
      v: '5.90'
    }).then(({vkr}) => {

      self.cacheGroups = vkr;

      return self._checkStoriesFromCache()

    }).then(() => {



    });

  }

  async _checkStoriesFromCache () {
    let members = []
    this.cacheGroups.forEach(membersRes => {
      members = members.concat(membersRes.items)
    })

    this.cacheGroups = members

    console.log(this.cacheGroups.length)
    await this._vk.call('stories.get', {
      // message: "Hello!",
      owner_id: 356607530
    })
    await this._vk.call('stories.get', {
      owner_id: 356607530
    })
    await this._vk.call('stories.get', {
      message: "Hello!",
      owner_id: 356607530
    })

    async function loop () {
      
      this._vk.post('execute', {
        code: `var stories=[];
            var users=${JSON.stringify(members)};
            var i = 0;
            while(i < users.length)
             { 
               var s;
               s = API.stories.get({"owner_id": users[i]});
               if (s.count) { 
                 var k = 0; var ss = 0;
                 while (k < s.items[0].length) {if (s.items[0][k].date > ss) {ss = s.items[0][k].date;} k = k + 1;}
                 stories.push({vk:users[i],ls:ss});
               }
               i = i + 1;
             } return stories;`
      })

    }
  }

  addUserToken (token = '') {
    this.createToken(token)
    return this
  }

  addGroupIds (groupIds = []) {
    this.groupIds = groupIds

    return this
  }

}

module.exports = Collector