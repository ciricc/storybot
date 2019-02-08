const easyvk = require('easyvk')
const md5 = require('md5')
const fs = require('fs')

const Utils = require('./Utils')


class Collector {
  
  constructor (settings = {}) {

    let tokens = settings.tokens || []
    let idsFiles = settings.idsFiles || []

    this.fileIds = []

    idsFiles.forEach((filePath) => {

      this.fileIds.push({
        path: filePath,
        hashId: md5(filePath)
      })

    }, this)

    this.activeFile = ''
    this.activeFileIndex = 0

    this.tokens = {  
      active: 0
    }

    this.userTokens = []
    this.groupIds = []
    
    this.activeGroup = 0
    this.activeGroupIndex = 0

    this.groupsCursor = {}
    this.filesCursor = {}

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
        self._log('Adding new group to database ...')

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

    await Utils.asyncLoop(self.fileIds.length, async (loop) => {
      let file = self.fileIds[loop.iteration]

      let count = await self.files.countDocuments({
        $and: [{"file_id": file.hashId}, {"bot_name": self.botName}]
      })

      if (!count) {
        self._log('Adding new file to database ...')
        await self.files.insertOne({
          "file_id": file.hashId,
          "offset": 0,
          "count_of_stories": 0,
          "last_check_time": 0,
          "bot_name": self.botName
        });
      }

      loop.next()
    })

    self._groupsCursor = await self.groups.find(self.constructQueryGetAllMyGroups())

    await self._groupsCursor.forEach(group => {
      self.groupsCursor[group.group_id] = group
    })

    self._filesCursor = await self.files.find(self.constructQueryGetAllMyFiles())

    await self._filesCursor.forEach(file => {
      self.filesCursor[file.file_id] = file
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
        $and: [{
          "group_id": gid
        }, {
          "bot_name": this.botName
        }]
      })
    })

    return obj;
  }

  constructQueryGetAllMyFiles () {
    let obj = {
      $or: []
    }

    this.fileIds.forEach((file) => {
      
      obj.$or.push({
        $and: [{
          "file_id": file.hashId
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


        if (!vkr[0].items.length) {
          // Участники закончились, нужно перейти на следующую группу
          self.activeGroupIndex += 1

          if (!self.groupIds[self.activeGroupIndex]) {
            
            self._log('Bot stopped! All groups was checked!')

            return 
          } else {
            self.activeGroup = self.groupIds[self.activeGroupIndex]
            self._log('Group changed to new (' + self.activeGroup + ')')

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

    async function loopFiles () {
      
      if (!this.activeFile) this.activeFile = this.fileIds[this.activeFileIndex].hashId

      let activeFile = this.filesCursor[this.activeFile]
      offset = activeFile.offset

      let execs = [];

      self._log('offset=' + offset, 'activeGroup=' + this.activeGroup)
       
      let _users = fs.readFileSync(this.fileIds[this.activeFileIndex].path).toString()
      let users = []
      _users = _users.replace(/\r/g, "").split('\n')
      _users.forEach((user) => {
        user = user.replace(/([^0-9]+)/g, '')

        if (user) {
          users.push(user)
        }
      })

      users.splice(0, offset)

      self.cacheGroups = users;


      async function makeFile () {
        if (!users.length) {
        // Участники закончились, нужно перейти на следующий файл

          self.activeFileIndex += 1

          if (!self.fileIds[self.activeFileIndex]) {
            
            self._log('All files was checked!')

            return 
          } else {
            
            self.activeFile = self.fileIds[self.activeFileIndex].hashId

            self._log('File changed to new (' + self.activeFile + ')')

            return await loopFiles.call(self)
          }
        }

        return self._checkStoriesFromCache(true)
      }

      return makeFile().then(async () => {

        if (!self.fileIds[self.activeFileIndex]) {
          return false
        }

        return await loopFiles.call(self)
      })
    }  

    if (this.fileIds.length) {
      await loopFiles.call(this)
    }

    if (this.groupIds.length) {
      await loopGroups.call(this)
    }

    self._log('All process in collecor stopped!')

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
                 while (k < s.items[0].length) {if (s.items[0][k].date > ss) {ss = s.items[0][k].date;} k = k + 1;}
                 stories.push({vk:users[i],ls:ss,stid:s.items[0][0].id});
               }
               i = i + 1;
             } return stories;`
      });

     
     if (fromFile) {
       let file = this.filesCursor[this.activeFile]
       file.offset += 25
       file.count_of_stories += vkr.length
       file.last_check_time = new Date().getTime()


       await this._updateFile(file)

       if (vkr.length) {
         await this._addUsers(vkr, null, file.file_id)
       }

     } else {
       let group = this.groupsCursor[this.activeGroup]

       group.offset += 25;
       group.count_of_stories += vkr.length
       group.last_check_time = new Date().getTime()

       await this._updateGroup(group);
       if (vkr.length) {
         await this._addUsers(vkr, group.group_id)
       }
     }


     if (members.length) {
       await loop.call(this);
     } else {
       return true;
     }
    }

    return await loop.call(this)
  }

  async _addUsers (users = [], gid = 0, fid = '') {
    let _users = []
    let identi = 'group_' + gid

    if (fid) {
      identi = 'file_' + fid
    }

    users.forEach(user => {
      user[identi] = true
      user["bot_name"] = this.botName
      user.vk = Number(user.vk)
      _users.push(user)
    }, this)

    return this.users.insertMany(_users)
  }

  async _updateGroup (group = {}) {
    
    return this.groups.updateOne({
      _id: group._id
    }, {
      $set: group
    })

  }

  async _updateFile (file = {}) {
    
    return this.files.updateOne({
      _id: file._id
    }, {
      $set: file
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