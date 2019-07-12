const colors = require('colors')
const knex = require('knex')
const Collector = require('./Collector')
const Utils = require('./Utils')



const DEFAULT_GROUP_IDS = [57846937]
const BOT_NAME_LENGTH = 128

class Bot {

  constructor (dbSetup = {}) {
    this.bots = [];
    
    if (dbSetup.log !== undefined && typeof dbSetup.log !== "function") {
      throw new Error('Log function must be only of function type')
    }

    if (dbSetup.command !== undefined && typeof dbSetup.command !== "function") {
      throw new Error('Command handler function must be only of function type')
    } 
    
    if (!dbSetup.database) dbSetup.database = {}

    this.knexBuilder = knex({
      client: 'sqlite3',
      connection: dbSetup.database,
      useNullAsDefault: true
    });

    this.options = dbSetup;

    this.state = {
      stopped: false
    }
  }


  addBot (configurationBot = {}) {

    configurationBot = this._checkConfigBot(configurationBot)
     
    this.bots.push(configurationBot)
  }


  _checkConfigBot (configurationBot = {}) {
    if (!Array.isArray(configurationBot.viewers)) throw 'viewers property must be array'
    if (!configurationBot.collector || !(configurationBot.collector instanceof Collector)) throw 'collector property must be Collector class'
    if (!configurationBot.groupIds || !Array.isArray(configurationBot.groupIds)) configurationBot.groupIds = DEFAULT_GROUP_IDS 
    
    if (!configurationBot.name) throw 'name property must be string'

    return configurationBot
  }

  _command (...args) {
    if (this.options && this.options.command) this.options.command(...args)

    if (args[0] === "collector") {
      switch (args[1]) {
        case 'stop_process':
          this.state.stopped = true;
          break;
      }
    }

  }

  _log (...args) {
    if (this.options && this.options.log) return this.options.log(...args)

    return console.log(String('[timestamp(' + Math.floor(new Date().getTime() / 1000) + ')] ').yellow, ...([...args].map(a => {
      let ca = a.toString()
      return (ca.match(/^\[Error\]/)) ? ca.red : 
      (ca.match(/^\[Info\]/)) ? ca.cyan : ca.white; 
    })))
  }

  async startBots () {
    let self = this;

    return new Promise(async (resolve, reject) => {
      
    
      await this.knexBuilder.schema.createTable('groups', (table) => {
        table.increments('id')
        table.string('bot_name', BOT_NAME_LENGTH) /** Имя бота */
        table.bigInteger('group_id') /** ID Группы */
        
        table.unique(['bot_name', 'group_id'])

        table.integer('offset') /** Смещение по участникам */
        table.integer('count_of_stories') /** Количество найденных историй из данной группы */
        table.bigInteger('last_check_time') /** Время, когда в полседний раз проверялась */
      }).catch(e => {})

      await this.knexBuilder.schema.createTable('collectors', (table) => {
        table.increments('id')
        table.string('bot_name', BOT_NAME_LENGTH) /** Имя бота */
        table.integer('target_offset') /** Индекс последнего пользователя из массива target у которого проверили наличие историй */
        table.integer('target_count_of_stories') /** Кол-во историй из таргета */
        table.integer('target_last_check_time') /** Timestamp последнего сбора */
      }).catch(e => {})

      await this.knexBuilder.schema.createTable('users', (table) => {
        table.increments('id')
        table.bigInteger('vk_id') /** VK ID пользователя */
        table.string('bot_name', BOT_NAME_LENGTH) /** Название бота */
        
        table.unique(['bot_name', 'vk_id'])

        table.text('stids') /** Идентифекаторы историй, которые были у пользователя */
        table.bigInteger('ls') /** Время последней проверки историй */
      }).catch(e => {})

      await this.knexBuilder.schema.createTable('viewers', (table) => {
        table.increments('id')
        table.bigInteger('viewer_id') /** VK ID аккаунта виювера */
        table.string('bot_name', BOT_NAME_LENGTH) /** Название бота */
        
        table.unique(['bot_name', 'viewer_id'])


        table.integer('last_user_checked_id') /** ID пользователя из таблицы users который был проверен этим виювером последним */
        table.integer('viewed') /** Кол-во просмотренных историй всего */
        table.integer('viewed_accounts') /** Кол-во просмотренных уникальных аккаунтов всего */
      }).catch(e => {})

      self._log('Connected to sqlite db')
      

      await Utils.asyncLoop(self.bots.length, async (loop) => {
          
        let bot = self.bots[loop.iteration];
        
        await Utils.asyncLoop(bot.viewers.length, async (viewerLoop) => {
          let viewer = bot.viewers[viewerLoop.iteration]

          viewer.botName = bot.name
          viewer.db = self.knexBuilder
          
          viewer.controllerState = self.state;

          viewer._log = (...args) => {
            self._log('(Viewer)\n'.cyan, ...args)
          }

          viewer._command = (...args) => {
            self._command('viewer', viewer._vk.session.user_id, ...args)
          }

          await bot.viewers[viewerLoop.iteration].init()

          viewerLoop.next()

        })

        bot.viewers.forEach((viewer) => {
          if (!bot.collector.settings.tokens.length) {
            bot.collector.addUserToken(viewer._vk.session.access_token)
          }
        })

        bot.collector.addGroupIds(bot.groupIds)
        bot.collector.botName = bot.name
        bot.collector.db = self.knexBuilder
        bot.collector._log = (...args) => {
          self._log('(Collector)\n'.cyan, ...args)
        }

        bot.collector._command = (...args) => {
          self._command('collector', 0, ...args)
        }

        loop.next()

      })

      self.bots.forEach((bot) => {
        bot.collector.run()
      })

      resolve(true)
    })

  }

}


module.exports = Bot;