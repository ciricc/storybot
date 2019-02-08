const MongoClient = require("mongodb").MongoClient;
const Collector = require('./Collector')
const Utils = require('./Utils')



const DEFAULT_GROUP_IDS = [57846937]
const MONGO_DB_NAME = 'storybot'


class Bot {

  constructor (dbSetup = {}) {
    this.bots = [];
    
    if (!dbSetup.urlDb) dbSetup.urlDb = 'mongodb://localhost:27017/'

    this.mongoClient = new MongoClient(dbSetup.urlDb, { 
      useNewUrlParser: true
    });
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

  _log (...args) {
    return console.log('[' + new Date() + '] ', ...args)
  }

  async startBots () {
    let self = this;

    return new Promise(async (resolve, reject) => {
      
      self.mongoClient.connect(async (err, client) => {
        
        self._log('Connected to db')

        if (err) return reject(err)
      
        self.db = client.db(MONGO_DB_NAME)

        await Utils.asyncLoop(self.bots.length, async (loop) => {
          
          let bot = self.bots[loop.iteration];
          
          await Utils.asyncLoop(bot.viewers.length, async (viewerLoop) => {
            let viewer = bot.viewers[viewerLoop.iteration]
              
            // console.log(bot.botName, 'botName')
            viewer.botName = bot.name
            viewer.db = self.db
            viewer._log = self._log

            await bot.viewers[viewerLoop.iteration].init()

            viewerLoop.next()

          })

          bot.viewers.forEach((viewer) => {
            bot.collector.addUserToken(viewer._vk.session.access_token)
          })

          bot.collector.addGroupIds(bot.groupIds)
          bot.collector.botName = bot.name
          bot.collector.db = self.db
          bot.collector._log = self._log

          loop.next()

        })

        self.bots.forEach((bot) => {
          bot.collector.run()

        })

      })  


      resolve(true)

    })

  }

}


module.exports = Bot;