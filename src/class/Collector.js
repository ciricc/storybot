const easyvk = require('easyvk')
const fs = require('fs')

const Utils = require('./Utils')


class Collector {
  
  constructor (settings = {}) {

    let tokens = settings.tokens || []
    let idsFiles = settings.idsFiles || settings.fileIds || []

    this.fileIds = []

    idsFiles.forEach((filePath) => {

      this.fileIds.push({
        path: filePath
      })

    }, this)

    this.tokens = {  
      active: 0
    }

    this.userTokens = []
    this.groupIds = []
    
    this.activeGroup = 0
    this.activeGroupIndex = 0

    this.groupsCursor = {}

    this.cacheGroups = []


    this._log = Function()
    this._command = Function()


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
            // self._log('Token changed... to ' + self.tokens.active)
            thread.query.access_token = self.userTokens[self.tokens.active]
          }

          let waitThisToken = (self.tokens[self.userTokens[self.tokens.active]].secondStarted + 1000) - new Date().getTime();
          if (waitThisToken < 0) waitThisToken = 0

          // self._log('Waiting...', waitThisToken)
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
      // self._log('Request completed!')
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
    this.users = this.db.collection('users')
    this.files = this.db.collection('files')

    return this._runCollectingStories()
  }

  async _runCollectingStories () {
    
    let self = this

    await Utils.asyncLoop(self.groupIds.length, async (loop) => {
      let groupId = self.groupIds[loop.iteration]

      let count = await self.groups.countDocuments({
        $and: [{"group_id": groupId}, {"bot_name": self.botName}]
      })

      if (!count) {
        self._log('Добавляем группу в базу данных...')

        await self.groups.insertOne({
          "group_id": groupId,
          "offset": 0,
          "count_of_stories": 0,
          "last_check_time": 0,
          "bot_name": self.botName
        });
      }

      loop.next()

    })


    if (self.groupIds.length) {
      self._groupsCursor = await self.groups.find(self.constructQueryGetAllMyGroups())

      await self._groupsCursor.forEach(group => {
        self.groupsCursor[group.group_id] = group
      })
    }

    self._log('Группы из настроек были проверены и добавлены в базу')
    
    return self._getNewStories()
  }

  constructQueryGetAllMyGroups () {
    let obj = {
      $or: []
    }

    this.groupIds.forEach((gid) => {
      obj.$or.push({
        $and: [{
          "group_id": gid
        }, {
          "bot_name": this.botName
        }]
      })
    })

    return obj;
  }


  async _getNewStories () {
    let offset = 0;
    
    let self = this

    async function loopGroups () {
      
      if (!this.activeGroup) this.activeGroup = this.groupIds[this.activeGroupIndex]

      offset = this.groupsCursor[this.activeGroup].offset

      let execs = [];

      self._log('offset=' + offset, 'activeGroup=' + this.activeGroup)
      
      return this._vk.post('execute', {
        code: `var gid = ${this.activeGroup};var i = 0;
  var offsetStart = ${offset};
  var members = [];
  while (i < 25) { members.push(API.groups.getMembers({            "group_id": gid,
  "sort": "id_desc",
  "offset": offsetStart + i * 1000,
  "count": 1000}));          i = i + 1;        }       return members;`,
        v: '5.90'
      }).then(async ({vkr}) => {

        self.cacheGroups = vkr;

        if (vkr[0] === false || !vkr[0].items.length) {
          // Участники закончились, нужно перейти на следующую группу
          self.activeGroupIndex += 1
          
          if (vkr[0] === false) {
            self._log(`[Error] Участники группы @club${this.activeGroup} не были получены. Убедитесь, что группа доступна аккаунту коллектора и не заблокирована`)
          }

          if (!self.groupIds[self.activeGroupIndex]) {
            
            self._log('Работа остановлена! Все группы были проверены на наличие историй')

            return 
          } else {
            self.activeGroup = self.groupIds[self.activeGroupIndex]
            self._log('Переключаемся на новую группу', self.activeGroup)

            return await loopGroups.call(self)
          }
        }

        return self._checkStoriesFromCache()

      }).then(async () => {
        // one offset completed, need update offset

        if (!self.groupIds[self.activeGroupIndex]) {
          return false
        }

        return await loopGroups.call(self)
      })
    }
  

    async function getIdsFromFiles () {
      let users = [];
      
      this.fileIds.forEach(file => {
        let _users = fs.readFileSync(file.path).toString();

        _users = _users.replace(/\r/g, "").split(/\n|\s/)
        _users.forEach((user) => {
          user = user.replace(/([^0-9]+)/g, '')
          if (user) {
            users.push(Number(user))
          }
        })
      })

      this.groupIds = users.concat(this.groupIds)
    }

    if (this.fileIds.length) {
      await getIdsFromFiles.call(this)
    }


    if (this.groupIds.length) {
      await loopGroups.call(this)
    }

    self._log('Все процессы в коллекторе отключены')
    self._command('stop_process')

    return true;
  }

  async _checkStoriesFromCache (fromFile = false) {
    let members = []

    if (!fromFile) {
      this.cacheGroups.forEach(membersRes => {
        members = members.concat(membersRes.items)
      })
    } else {
      members = this.cacheGroups 
    }
  

    this.cacheGroups = members
    
    async function loop () {
      let countOf = members.length;
      let {vkr} = await this._vk.post('execute', {
        code: `var stories=[];
            var users=${JSON.stringify(members.splice(0, 25))};
            var i = 0;
            while(i < users.length)
             { 
               var s;
               s = API.stories.get({"owner_id": users[i]});
               if (s.count) { 
                 var k = 0; var ss = 0;
                 var stids = [];
                 while (k < s.items[0].length) {
                   if (s.items[0][k].date > ss) {
                   ss = s.items[0][k].date;
                   } 
                   stids.push(s.items[0][k].id);
                   k = k + 1;
                 }
                 stories.push({vk:users[i],ls:ss,stids:stids});
               }
               i = i + 1;
             } return stories;`
      });

     
     let group = this.groupsCursor[this.activeGroup]

     group.offset += (countOf < 25) ? countOf : 25;
     group.count_of_stories += vkr.length
     group.last_check_time = new Date().getTime()

     await this._updateGroup(group);
     
     if (vkr.length) {
      this._log(`Достали ${vkr.length} пользователей из группы @club${group.group_id}, (offset=${group.offset})`)
     }

     if (vkr.length) {
       await this._addUsers(vkr, group.group_id)
     }


     if (members.length) {
       await loop.call(this);
     } else {
       return true;
     }
    }

    return await loop.call(this)
  }

  async _addUsers (users = [], gid = 0) {
    // let _users = []
    let identi = 'group_' + gid


     return users.forEach(async user => {
      user[identi] = true
      user["bot_name"] = this.botName
      user.vk = Number(user.vk)

      await this.users.updateOne(user, {
        $set: user
      }, {
        upsert: true
      })
    }, this)

  }

  async _updateGroup (group = {}) {
    
    return this.groups.updateOne({
      _id: group._id
    }, {
      $set: group
    })

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