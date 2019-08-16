const easyvk = require('easyvk')
const fs = require('fs')

const Utils = require('./Utils')

const COUNT_USERS_FOR_ONE_TOKEN = 25;
const WAIT_TIME = 1024;

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
    this.settings = settings;

    if (!this.settings.tokens || !this.settings.tokens.length) {
      throw new Error('You need setup tokens property in collector')
    }

    if (this.settings.collectFromGroups !== false) {
      this.settings.collectFromGroups = true;
    }

    if (!this.settings.target) {
      this.settings.target = {}
    }

    if (!this.settings.target.users) {
      this.settings.target.users = [];
    }

    this._log = Function()
    this._command = Function()
    this.countRequests = 150;

    tokens.forEach(token => {
      if (token) {
        this.createToken(token)
      }
    }, this)

    let self = this;


    this.easyVKMiddleWare = async ({thread, next}) => {
         
      let now = new Date();
      let token = thread.query.access_token;

      if (!this.tokens[token]) {
        this.tokens[token] = {
          lastRequest: now.getTime(),
          requestsCount: 0
        }
      }

      let tokenState = this.tokens[token];
      let deltaTime = now - tokenState.lastRequest;
      
      if (deltaTime <= WAIT_TIME && tokenState.requestsCount > 3) {
        await Utils.sleep(WAIT_TIME - deltaTime)
        tokenState.requestsCount = 0;
      } 

      tokenState.lastRequest = now.getTime();
      tokenState.requestsCount += 1;

      return await next();
    }

  }

  createToken (token) {

    this.userTokens.push(token)

    this.tokens[token] = {
      lastRequest: 0,
      requestsCount: 0
    }
  }

  async run () {

    let vk = await easyvk({
      ...(this.settings.easyvkParams || {}),
      save_session: false,
      reauth: true,
      debug: this.settings.easyvkDebug,
      access_token: this.settings.tokens[0]
    })
    
    this._vk = vk
    this._vk.use(this.easyVKMiddleWare, console.error)
    
    this.groups = this.db('groups')
    this.users = this.db('users')
    
    /** Сколько токенов уже завершили работу со своей порцией */
    this.tokenStopped = 0;
    
    this.collectingTarget = true;

    this.cacheGroups = this.settings.target.users || [];
    
    this.collectorRaw = await this.getCollectorRaw();

    if (!this.collectorRaw || !this.collectorRaw[0]) {
      await this.createCollectorRaw();
      this.collectorRaw = await this.getCollectorRaw();
    }

    this.collectorRaw = this.collectorRaw[0]

    if (this.settings.target.files) {
      if (!Array.isArray(this.settings.target.files)) {
        this.settings.target.files = [this.settings.target.files]
      }

      this.settings.target.files.forEach(file => {
        try {
          let users = [];
          let _users = fs.readFileSync(file, 'utf-8');
          _users = _users.replace(/\r/g, "").split(/\n|\s/)
          _users.forEach((user) => {
            user = user.replace(/([^0-9]+)/g, '')
            if (user) {
              users.push(Number(user))
            }
          });
          this.cacheGroups = this.cacheGroups.concat(users);
          return;
        } catch (e) {
          throw new Error('You need setup correct target users file: ' + file)
        }
      })
    }

    this.cacheGroups.splice(0, this.collectorRaw.target_offset);

    return this._runCollectingStories()
  }

  createCollectorRaw () {
    return this.db('collectors').insert({
      bot_name: this.botName,
      target_offset: 0,
      target_count_of_stories: 0,
      target_last_check_time: 0
    });
  }

  getCollectorRaw () {
    return this.db('collectors')
    .select('*')
    .where('bot_name', '=', this.botName);
  }

  async _runCollectingStories () {
    
    let self = this

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

    await Utils.asyncLoop(self.groupIds.length, async (loop) => {
      let groupId = self.groupIds[loop.iteration]

      let count = await self.db('groups')
      .select(self.db.raw('count(`id`) as `count`, `group_id`'))
      .where('group_id', '=', groupId)
      .andWhere('bot_name', '=', self.botName)

      count = count[0].count;
      
      if (!count) {
        self._log('Добавляем группу в базу данных...')
        console.log(groupId, 'ok', {
          "group_id": groupId,
          "offset": 0,
          "count_of_stories": 0,
          "last_check_time": 0,
          "bot_name": self.botName
        })
        await self.db('groups').insert({
          "group_id": groupId,
          "offset": 0,
          "count_of_stories": 0,
          "last_check_time": 0,
          "bot_name": self.botName
        }).catch(e => {
          console.log(e, groupId)
        });
      } else {
        console.log('Есть')
      }

      loop.next()

    })


    if (self.groupIds.length) {
      self._groupsCursor = await self.db('groups').select('*')
      .whereIn('group_id', self.constructQueryGetAllMyGroups())
      .andWhere('bot_name', '=', this.botName)

      await self._groupsCursor.forEach(group => {
        self.groupsCursor[group.group_id] = group
      })
    }

    self._log('Группы из настроек были проверены и добавлены в базу')
    
    return self._checkStoriesFromCacheFast()
  }

  constructQueryGetAllMyGroups () {
    let groups = [];

    this.groupIds.forEach((gid) => {
      groups.push([gid]);
    })

    return groups;
  }

  targetFilter (item) {
    if (this.settings.target) {
      let target = this.settings.target;
      if (target.sex) {
        return target.sex === this.usersData[item].sex;
      }
    }

    return true;
  }

  async _updateGroupMembers () {
    let offset = 0;
    
    let self = this
    

    return new Promise(async (resolve, reject) => {
      if (self.startedUpdate) return resolve(true);
  
      self.startedUpdate = true;

      async function loopGroups () {

        offset = this.groupsCursor[this.activeGroup].offset

        let execs = [];

        self._log('offset=' + offset, 'activeGroup=' + this.activeGroup)
        
        async function retry () {
          let limitCount = 300;
          return self._vk.post('execute', {
            code: `var gid = ${self.activeGroup};var i = 0;
            var offsetStart = ${offset};
            var members = [];
            while (i < 25) { members.push(API.groups.getMembers({            "group_id": gid,
            "offset": offsetStart + i * ${limitCount},
            "fields": "sex",
            "count": ${limitCount}}));          i = i + 1;        }       return members;`,
            v: '5.90',
            access_token: self.settings.tokens[Utils.rand(0, self.settings.tokens.length-1)]
          }).then(async ({vkr}) => {

            self.usersData = {}
            self.countRequests+=25;
            fs.appendFileSync('access_true.txt', self.countRequests + ' ' + ((vkr[0].items) ? true : false) + ' ' + new Date() + '\n' )

            let _vkr = [];
            vkr[0].items.forEach((item, i) => {
              if (item.id) {
                self.usersData[item.id] = item;
                _vkr.push(item.id)
              }
            });
            

            // console.log(self.usersData)
            self._log('Получили участников: ', vkr[0].items.slice(0,5).join(',') + '...', vkr[0].items.length)

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
            } else {
              // Настраиваем таргет
              let __vkr = Array.from(_vkr);

              __vkr = __vkr.filter(self.targetFilter, self);
              vkr[0].items = __vkr;
              
              self.cacheGroups = [{
                items: __vkr
              }];

              // console.log(self.cacheGroups[0].items)
            }
            // console.log('Here from collector')
            self.startedUpdate = false;
            return true;
          }).then(async () => {
            // one offset completed, need update offset

            if (!self.groupIds[self.activeGroupIndex]) {
              return false
            } else {
              return true;
            }
          }).catch(async (e) => {
            console.log(e)
            self._log('Ждем восстановления сервера...');
            self.startedUpdate = false;
            await Utils.sleep(1000);
            return retry();
          })
        }

        return await retry();
      }
    


      if (this.groupIds.length) {
        let res = await loopGroups.call(this);
        if (res) return resolve(res);
      }

      self._log('Все процессы в коллекторе отключены')
      self._command('stop_process')
      self.startedUpdate = false;
      return resolve(false);
    })
  }


  async _checkStoriesFromCacheFast () {

    return new Promise((resolve, reject) => {
      /** Данный алгоритм создает непрерывный поиск историй на максимально доступной скорости для всех токенов */
      for (let token of this.settings.tokens) {
        let loop = async ()  => {
          let members = [];
          console.log(members)
          this.cacheGroups.forEach(membersRes => {
            members = members.concat(membersRes.items ? membersRes.items : [membersRes])
          })
          
          if (!this.activeGroup) 
              this.activeGroup = this.groupIds[this.activeGroupIndex]

          this.cacheGroups = members

          // console.log(members)
          /** 
            Эта функция постоянно проверяет из списка доступных учатсников наличие историй,
            она запускается для каждого токена отдельно, и, когда участников не остается совсем,
            она дает понять коллектору, что нужно собрать новых
          */
          
          let seeNow = members.splice(0, COUNT_USERS_FOR_ONE_TOKEN);
          let countOf = seeNow.length;
          
          this._log(token.slice(0,10) + '..', '================================= loop', seeNow.length)

          /** 
            Собираем участников только с наличием историй, middleware позоботиться о том,
            чтобы запросы проходили только по своим собственным ограничениям, а не по общим
          */ 
          let { vkr } = await this._vk.post('execute', {
            access_token: token,
            code: `var stories=[];
              var users=${JSON.stringify(seeNow)};
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
          
          let group;

          if (!this.collectingTarget) {
            group = this.groupsCursor[this.activeGroup]

            group.offset += (countOf < 25) ? countOf : 25;
            group.count_of_stories += vkr.length
            group.last_check_time = new Date().getTime()

            /** Обновляем группу в базе данных для сборы новых пользователей */
            await this._updateGroup(group);
          } else {
            this.collectorRaw.target_offset += (countOf < 25) ? countOf : 25;
            this.collectorRaw.target_count_of_stories += vkr.length;
            this.collectorRaw.target_last_check_time = new Date().getTime();

            await this._updateCollectorRaw(this.collectorRaw)
          }

          if (vkr.length) {
            if (!this.collectingTarget) {
              this._log(`Достали ${vkr.length} пользователей из группы @club${group.group_id}, (offset=${group.offset})`)
            }
          }

          /** А теперь добавляем в базу всех, кого удалось найти*/
          if (vkr.length) {
            await this._addUsers(vkr)
          }

          /**
            Теперь самое сложное. Это понять, что все токены разобрались со своими данными и просить 
            в этот момент новую "порцию"
          */
          if (!members.length) {
             /**
                Было два варианта как сделать процесс обновления
                1. Это ждать, когда все токены проделают свою работу, и на последнем запросить обновление
                2. Это подождать, когда хотя бы на одном из них произойдет "остановочка" и запросить опять свежую порцию без остановки других

                Я выбрал второй вариант, чтобы остич максимальной скорости. Не забыв про то, что приблизительно в одно
                и то же время у двух токенов может не оказаться "порции", и они оба запросят обновления. Мы будем игнорировать
                все запрос кроме одного
             */
             
             this.collectingTarget = false;
             this._log('Все истории из таргета просомтрены')
             try {
              let responseMembers = this.settings.collectFromGroups ? await this._updateGroupMembers() : false
                if (responseMembers) { // Если все ок, обновилось, это означает, что участникик еще есть
                  /** То тогда мы запускаем снова процесс съедание "порции" */
                  return loop();
                } else {// Участников в группе уже не осталось, мы ждем, когда все токены придут к этому состоянию

                this.tokenStopped += 1;

                if (this.tokenStopped >= this.settings.tokens.length) {
                  this._log('Все токены коллектора прекратили работу')
                  return
                } else {
                  this._log('Токен ' + token.slice(0,10) + '.. прекратил работу', this.tokenStopped)
                }
               }
             } catch (e) {
              console.log(e)
             }
          }

          // Запускаем снова, если пользователи еще остались
          return loop();
        }

        loop()
      }
    })

  }

  async _addUsers (users = []) {
     return users.forEach(async user => {
      if (user.vk) {
        let _user = {};
        
        Object.keys(user).forEach(key => {
          if (key !== "vk") {
            _user[key] =  user[key];
          }
        });

        _user.vk_id = user.vk
        user = _user;
      }
      
      user.bot_name = this.botName
      user.vk_id = Number(user.vk_id)
      user.stids = user.stids.join(',')

      let userFromDb = await this.db('users')
      .select('vk_id')
      .where('vk_id', '=', user.vk_id)
      .andWhere('bot_name', '=', user.bot_name)

      if (userFromDb[0] && Object.keys(userFromDb[0]).length) {
        await this.db('users')
        .where('vk_id', '=', user.vk_id)
        .andWhere('bot_name', '=', user.bot_name)
        .update(user)
      } else {
        await this.db('users').insert(user)
      }
    }, this)

  }

  async _updateGroup (group = {}) {
    
    return this.db('groups')
    .update(group)
    .where('id', group.id)
  }

  async _updateCollectorRaw (collectorRaw = {}) {
    
    return this.db('collectors')
    .update(collectorRaw)
    .where('id', collectorRaw.id)
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
process.on('unhandledRejection', console.error)
process.on('uncaughtException', console.error)