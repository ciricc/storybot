# storybot
Бот, который смотрит истории ВКонтакте

## API

Бот предоставляет JavaScript API для работы с ним

## О чем речь

Если вы не в теме, то поясню, зачем все это нужно.

Когда-то давно, в 2018 году буквально через 3 дня после моего др, я написал статью на Пикабу о том, как воспользовался идеей маркетологов для наращивания статистики посещения страницы ВКонтакте. Метод заключаетя в том, что вы создаете бота, который будет самостоятельно просматривать истории пользователей ВКонтакте, а они в свою очередь будут от интереса "who are you, man?" посещать вашу страницу.

Тогда у меня получились неплохие цифры по посещаемости, охват вырос с 50 посещений до 28 тысяч. Вы можете почитать как это было в этой статье (https://pikabu.ru/story/o_tom_kak_ya_ispolzoval_prosmotryi_storis_dlya_piara_v_vk_6123084)

Бот из статьи уже давно не работает и его поддержка не осуществляется, но тем не менее, сейчас вы находитесь на странице практически того же самого бота, но во много раз улучшенного и продуманного. Это API - это версия для разработчиков, которым хочется поэкспериментировать с данным функционалом. Он более стабильный, постоянно поддерживается и обновляется. Работает на sqlite3, в отличие от прошлой версии (MySQL, Mongo DB), а также оптимизирован под лимиты ВКонтакте так, чтобы не возникало неожиданных сбоев и проблем.

Софт полностью бесплатный, поэтому вы можете его использовать не покупая никаких дополнений и обновлений. <b>Если вам нужна настройка, найдите фрилансера, который это сможет сделать, а <i>я этим не занимаюсь</i></b>. 
(Это не значит, что бот не обновляется, напротив, обновления выходят по мере поступления новых проблем и запросов от разработчиков)

### Первый шаг
```javascript
const { Bot, Viewer, Collector} = require('storybot')

let BotController = new Bot({
  database: {
    filename: __dirname + '/storybot.sqlite'
  }
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

### Collector

Collector - это один или несколько аккаунтов, которые будут собирать список доступных историй у участников групп, которые указаны в настройках бота или коллектора

Так как storybot написан с помощью EasyVK, то он работает по его правилам (сохранение сессий, загрузка по ним занова)

В боте коллектор может быть только 1. Но аккаунто в нем может быть минимум 1 и максимум - количество доступных для вас разных токенов пользователей. Для того, чтобы коллектор запустился и работал, ему необходимо дать второй дополнительный токен со второго аккаунта! Это важно, потому что иначе вы будете упираться в лимиты и скорость коллектора будет значительно ниже, чем могла бы быть. 

Токены коллектора используются в максимальном режиме. Это значит, что чем больше токенов - тем быстрее коллектор собирает истории пользователей.

<b>Токены коллектора могут быть только токены, которые имеют доступ к следующим методам API ВКонтакте: stories.get, groups.getMembers, execute. Рекомендуется использовать только токены пользователя с максимальными правами доступа. На токенах групп бот не тестировался. Но по докам ВК, группы могут иметь доступ к методу stories.get</b>

```javascript

const { Collector } = require('storybot')

let myCollector = new Collector({
  fileIds: [__dirname + '/groups.data'],
  tokens: ['USER_TOKEN'], // НЕ МОЖЕТ БЫТЬ ПУСТЫМ
  target: {
    sex: 1,
    users: [1,2,3,4],
    files: [__dirname + '/users.ids']
  }
})

```

<b>Настройки Collector'а</b>

*  <b>fileIds</b> - массив путей к файлам, в которых хранятся идентификаторы групп, где каждый идентификатор - новая строка (пример файла)
```
179963918
57846937
29534144
``` 

*  <b>tokens</b> - массив токенов, между которыми коллектор автоматически будет переключаться, чтобы быстрее искать истории и быстрее находить пользователей. Коллектор должен уложиться в лимиты, которые устанавливает ВКонтакте на количество запросов в минуту. В зависимости от количества токенов, будет использоваться тот, на котором скорее всего, сейчас нет ограничения. Если токен только один, то коллектор подстроится под лимиты и будет работать на максимально доступной скорости без ошибок
```javascript
tokens: ['token1', 'token2', 'token3', ...['tokenN']]
```
* <b>easyvkDebug</b> - параметр для продвинутых пользователей API - объект Debugger Easy VK для работы с дебагом запросов
* <b>target</b> - настройки таргета для более точного поиска аудитории
* <b>target.sex</b> - пол аудитории, в которой нужно искать истории <b>1</b> - женский пол, <b>2</b> - мужской пол
* <b>target.users[]</b> - массив идентифекаторов пользователей, у которых нужно искать истории
* <b>target.files[]</b> - массив путей к файлам, где хранятся идентифекатора пользователей, у которых нужно искать истории (соединяются вместе с <b>target.users[]</b>)
* <b>collectFromGroups</b> - нужно ли в данный момент искать участников в группах
* <b>easyvkParams</b> - объект с настройками `easyvk`

```javascript
new Collector({
  easyvkParams: {
    proxy: 'http://user:password@server:port'
  }
})
```

Или без пароля и логина (для socks тоже можно использовать логин и пароль)

```javascript
new Collector({
  easyvkParams: {
    proxy: 'socks5://150.129.54.111:6667'
  }
})
```

### Viewer

Viewer - это тот, кто просматривает истории. Виюверов может быть подключено сразу много, а также, их можно настроить по правилам авторизации easyvk (указать прокси, user-agent и другие параметры)

```javascript
const { Viewer } = require('storybot')


let Liza = new Viewer({
  account: {
    username: 'liza-iza@gmailinbox.com',
    password: 'AzaRaLize45067!'
  },
  reauth: false,
  proxy: 'socks5://150.129.54.111:6667',
  userAgent: 'MOT-V360v/08.B7.58R MIB/2.2.1 Profile/MIDP-2.0 Configuration/CLDC-1.1',
  captchaKey: 'key',
  captchaSid: 34040402,
  limitStoriesForUser: 1,
  startFromEnd: false
});

```

<b>Настройка Viwer'а</b>

*  <b>account</b> - объект настройки аккаунта (username, password)
*  <b>reauth</b> - нужно ли сделать авторизацию с чистого листа
*  <b>proxy</b> - адрес прокси сервера (SOCKS, http(s))
*  <b>userAgent</b> - User-Agent для запросов (header)
*  <b>captchaKey</b> - текст с полседней полученной капчи
*  <b>captchaSid</b> - ID последней полученной капчи
*  <b>code</b> - Код для двухфакторной аутентификации
*  <b>access_token</b> - забудьте об авторизации через HTTP клиент. С новым способом можно просто вставить access_token с максимальными правами, полученным <i>на стороне клиента приложения ВКонтакте</i>
*  <b>easyvkDebug</b> - параметр для продвинутых пользователей API - объект Debugger Easy VK для работы с дебагом запросов
*  <b>limitStoriesForUser</b> - максимальное кол-во историй, которое будет просматриваться у одного пользователя (их может быть и 50 сразу, но просМотрит он только <code>limitStoriesForUser</code> историй)
*  <b>startFromEnd</b> - нужно ли смотреть истории с конца. Конец - это самая последняя выложенная история пользователем

### Bot (бот)

Bot - это контроллер всего: виюверов и коллектора
Его настройки тоже возможны. В нем же настраивается список идентификаторов групп. Сам объект <code>Bot</code> - это не бот. Это комната для ботов, в которой они работают под руководством начальника (Bot'а)

Поэтому в одном файле можно запустить сразу несколько ботов, это не проблема. У каждого бота должно быть уникальное имя, чтобы в базе данных было легко его найти и использовать снова. Имя бота рекомендуется писать на латинице, чтобы избежать лишних ошибок и багов.

```javascript

const { Bot } = require('storybot')

let botController = new Bot({
  command: (controller, id, command, data) => {
    console.log(controller, id, command, data)
  },
  log: (...args) => {
    console.log(...args)
  },
  database: {
    filename: __dirname + '/storybot.sqlite'
  }
})

// Список групп
let groups = [];

// Добавляем бота
botController.addBot({
  viewers: [...[Liza]], // Обратите, пожалуйста, внимание на код из предыдущих частей документации
  colletor: myCollector,
  groupIds: [1, 2, 3, 4, ...[groups]],
  name: 'Bot1' // Уникальное имя бота (придумайте сами)
})

// Запускаем ботов

botController.startBots().then(() => {
  console.log('Все боты запущены!')
})

```

<b>Настройка Bot'а</b>

* <b>command</b> - функция, которая будет прослушивать внутренние команды виюверов и коллектора. Может помочь при создании софта на основе данного API

```javascript
command: (from, id, command, ...data) => {
  // from - название инициализатора команды (viewer,collector)
  // id - ID инициализатора (для виювера ID аккаунта, а для коллектора - 0)
  // command - текстовое обозначение команды
  // data[] - данные, которые пришли вместе с командой
}
```
* <b>log</b> - функция, которая будет ловить все <code>console.log()</code> бота. Может помочь, чтобы вести логи программы отдельно
* <b>database</b> - объект настроек для файла базы данных <code>sqlite</code>, вы можете использовать настройки из модуля <a href="https://www.npmjs.com/package/sqlite3">sqlite3</a>, опираясь на рекомендации модуля <a href="https://www.npmjs.com/package/knex">knex</a>

```javascript
new Bot({
  database: {
    filename: __dirname + '/storybot.sqlite'
  }
})
```

### Простое получение токена (Утилиты)

Для того, чтобы получить именно тот токен, который 100% подойдет для работы коллекторов, необходимо использовать данные для атворизации официальных клиентов. Сделать такое через стандартную oAuth авторизацию не получится, потому что oAuth никогда не дает действительно полный доступ даже к тому, к чему были выданы разрешения. Для получения максимального доступа необходимо использовать клиентскую атворизацию через официальные приложения. Поэтому это не так уж и просто)

Но в storybot я сделал этот момент упрощенным. Теперь можно легко получить подобный токен, воспользовавшись утилитами бота.

#### Utils.getToken(username, password, tokenPath)

Эта утилита получает токен. Автоматически запрашивает ручной ввод в консоли капчи, если она возникает, а также код для двухфакторной аутентификации, если он необходим. В конце ничего не возвращает, работает только с `output`, выводит токен в окно консоли и в указанный файл

* <b>username</b> - логин
* <b>password</b> - пароль
* <b>tokenPath</b> - путь, куда сохранится файл с токеном

```javascript
const {
  Utils
} = require('storybot');


async function main () {
  return Utils.getToken('liza-iza@gmailinbox.com', 'AzaRaLize45067!', 'C:/Users/.token')
}

main();
```

## Важности важные

Для того, чтобы бот работал, вам больше не нужно скачивать Mongo DB :) !
По всем вопросам работы софта, обащайтесь в личку <a href="https://vk.com/id356607530">https://vk.com/kinock</a>. Постараюсь помочь в настройке

Желаю вам успехов.