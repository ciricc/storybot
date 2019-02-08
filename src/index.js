const path = require('path')

const easyvk = require('easyvk')

const Viewer = require('./class/Viewer')
const Collector = require('./class/Collector')
const Bot = require('./class/Bot')
const Utils = require('./class/Utils')

;(async () => {
  let BotController = new Bot()
  
  let ViewerController = new Viewer({
    account: {
      username: 'USERNAME_FOR_1_VIEWER',
      password: 'PASSWORD_FOR_1_VIEWER',
    },
    userAgent: '',
    proxy: '',
    captchaSid: 973463356821,
    captchaKey: 'qc2nss'
  })


  let ViewerController2 = new Viewer({
    account: {
      username: 'USERNAME_FOR_2_VIEWER',
      password: 'PASSWORD_FOR_2_VIEWER',
    },
    userAgent: '',
    proxy: '',
    captchaSid: 973463356821,
    captchaKey: 'qc2nss'
  })
  
  let CollectorController = new Collector(
    {
      tokens: ['user_token_1', 'user_token_2', ...['user_token_n']], // user tokens, many too
      idsFiles: [ //this files can content your ids for users (with database) like 1\n2\n3
      'C:/Users/kirill_2/Documents/ддт.txt', 
      'C:/Users/kirill_2/Documents/бот.txt'
      ]
    }
  )
  
  BotController.addBot({
    viewers: [ViewerController],
    collector: CollectorController,
    groupIds: [162208999, 160259808, 48447820, 124427115, 27895931, 4321506], // groups, where bot will be searching
    name: "Bot1" // unically name for new bot DON'T USE SAME NAMES!!!
  })

  BotController.startBots().then(() => {
    console.log('Bot inited!')
  })  

})().catch(console.error);



module.exports.Collector = Collector;
module.exports.Bot = Bot;
module.exports.Viewer = Viewer;
module.exports.Utils = Utils;