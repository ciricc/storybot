# storybot
Бот, который смотрит истории ВКонтакте

## API

Бот предоставляет JavaScript API для работы с ним. Чтобы бот приступил к работе, ему необходима установленная база данных на MongoDB

### Первый шаг

```javascript
const { Bot, Viewer, Collector} = require('storybot')

let BotController = new Bot({
  dbName: 'storybot'
})

let KirillViewer = new Viewer({
  account: {
    username: 'ИМЯ_ПОЛЬЗОВАТЕЛЯ_ВК',
    password: 'ПАРОЛЬ_ВК'
  }
})

let KirillCollector = new Collector({
  tokens: ['токен_пользователя_1', ...['токен_пользователя_n']]
})


BotController.addBot({
  viewers: [KirillViewer],
  collector: KirillCollector,
  groupIds: [1,2],
  name: 'Bot1'
})


BotController.startBots().then(() => {
  console.log('Все боты запущены')
})

```
