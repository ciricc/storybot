const path = require('path')

const easyvk = require('easyvk')

const Viewer = require('./class/Viewer')
const Collector = require('./class/Collector')
const Bot = require('./class/Bot')


;(async () => {
  let BotController = new Bot()
  
  let ViewerController = new Viewer({
    account: {
      username: 'USERNAME_VIEWER',
      password: 'PASSWORD_VIEWER',
    },
    userAgent: '',
    proxy: '',
    captchaSid: 973463356821,
    captchaKey: 'qc2nss'
  })
  
  let CollectorController = new Collector(
    ["USER_TOKENS..."]
  )
  
  BotController.addBot({
    viewers: [ViewerController],
    collector: CollectorController,
    groupIds: [57846937]
  })

  BotController.init()  

})().catch(console.error);