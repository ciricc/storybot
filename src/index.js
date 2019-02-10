const path = require('path')

const easyvk = require('easyvk')

const Viewer = require('./class/Viewer')
const Collector = require('./class/Collector')
const Bot = require('./class/Bot')
const Utils = require('./class/Utils')

;(async () => {
  let BotController = new Bot()
  
  let ViewerController2 = new Viewer({
    account: {
      username: 'USERNAME',
      password: 'PASSWORD',
    },
    userAgent: '',
    proxy: '',
    captchaSid: 973463356821,
    captchaKey: 'qc2nss',
    reauth: true
  })
  
  let CollectorController = new Collector(
    {
      tokens: []
    }
  )
  
  BotController.addBot({
    viewers: [ViewerController2],
    collector: CollectorController,
    groupIds: [1,2],
    name: "Bot1"
  })

  BotController.startBots().then(() => {
    console.log('Bot inited!')
  })  

})().catch(console.error);


process.on('unhandledRejection', console.error)

module.exports.Collector = Collector;
module.exports.Bot = Bot;
module.exports.Viewer = Viewer;
module.exports.Utils = Utils;