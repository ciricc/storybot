const easyvk = require('easyvk')
const path = require('path')
const Utils = require('./Utils')
const colors = require('colors')

class Viewer {
  constructor (viewerConfig = {}) {
    this.botName = ''

    this.paramsEasyVK = {
      username: viewerConfig.account.username,
      password: viewerConfig.account.password,
      reauth: viewerConfig.reauth,
      proxy: viewerConfig.proxy,
      userAgent: viewerConfig.userAgent,
      session_file: path.join(__dirname, '..', 'cache', '.vk-session-' + viewerConfig.account.username.replace(/\+|@/g, '')),
      save_session: true,
      captcha_sid: viewerConfig.captchaSid,
      captcha_key: viewerConfig.captchaKey
    }

    this.controllerState = {}
  }

  async init () {
    let vk = await easyvk(this.paramsEasyVK)

    if (!vk.session.user_id) throw new Error('Why are you using not a user account? You need setup Viewer correctly')

    let { client } = await vk.http.loginByForm({
      user_agent: this.paramsEasyVK.userAgent,
      cookies: path.join(
        __dirname, '..',
        'cache',
        'cookies',
        'cookies-' + this.paramsEasyVK.username + '.json')
    })

    this._vk = vk
    this._client = client

    this.viewers = this.db.collection('viewers')
    this.users = this.db.collection('users')

    let count = await this.viewers.countDocuments({
      $and: [{ 'bot_name': this.botName }, { 'viewer_id': this._vk.session.user_id }]
    })

    if (!count) {
      await this.viewers.insertOne({
        'bot_name': this.botName,
        'viewer_id': this._vk.session.user_id,
        'last_user_checked_id': '',
        'viewed': 0,
        'viewed_accounts': 0
      })
    }

    this.viewerDoc = await this.viewers.findOne({
      $and: [{ 'bot_name': this.botName }, { 'viewer_id': this._vk.session.user_id }]
    })

    this.checked = {}

    this.run()

    return true
  }

  async run () {
    let query = {
      'bot_name': this.botName
    }

    if (this.viewerDoc.last_user_checked_id) {
      query = {
        $and: [{ 'bot_name': this.botName }, { '_id': {
          $gt: this.viewerDoc.last_user_checked_id
        } }]
      }
    }

    let users = await this.users.find(query)

    users = await users.toArray()

    let _users = []
    users.forEach((user, i) => {
      user.stids.forEach((stid) => {
        _users.push(user.vk + '_' + stid)
      })
    })

    users = _users

    async function loop () {
      return new Promise((resolve, reject) => {
        let self = this

        if (this._client._story_read_hash) {
          // Need uset more than one user
          let nowWatching = users.slice(0, 25)
          let countChecked = 0

          nowWatching.forEach((usr) => {
            let uid = usr.split('_')[0]

            if (!self.checked[uid]) {
              countChecked += 1
              self.checked[uid] = true
            }
          })

          this._log('Читаем истории (' + nowWatching.length + ')')
          self._command(
            'viewer_begin_reading',
            nowWatching.join(',')
          )
          this._client.__readStory(this._client._story_read_hash, nowWatching.join(','), 'profile', async (err, res) => {
            this._log(res.body, nowWatching.join(','))

            let checked = users.splice(0, 25)

            let uI = await self.users.findOne({
              $and: [
                { 'vk': Number(checked[checked.length - 1].split('_')[0]) },
                { 'bot_name': self.botName }
              ]
            })

            uI = uI._id

            this.viewerDoc.last_user_checked_id = uI
            this.viewerDoc.viewed += nowWatching.length
            this.viewerDoc.viewed_accounts += countChecked

            self._log('Проверили истории тут: vk.com/id' + checked[checked.length - 1].split('_')[0])

            self._command(
              'viewer_checked_stories',
              nowWatching.join(','),
              res.body
            )

            await this._updateViewerDoc(this.viewerDoc)
            return nextUsers()
          })
        } else {
          this._log('Обновляем хеш...')
          this._command(
            'viewer_update_hash',
            users[0].split('_')[0]
          )
          return this._client.readStories(users[0].split('_')[0]).then((count) => {
            self._log(count.count, users[0].split('_')[0])
            self._log('Прочитали!')
            this._command(
              'viewer_checked_stories',
              users[0].split('_')[0],
              ''
            )
            users.splice(0, 1)
            return nextUsers()
          })
        }

        async function nextUsers () {
          if (!users.length) {
            self._log('Все истории из базы просмотрены... ждем новые'.green, JSON.stringify(self.controllerState))

            await Utils.sleep(600)
            self._log('Новый цикл!')
            return self.run()
            return resolve(true)
          }

          setTimeout(() => {
            return loop.call(self)
          }, 600)
        }
      })
    }

    if (users.length) {
      this._log('Есть новые истории!')
      this._command(
        'viewer_continues'
      )
      await loop.call(this)
    } else {
      this._log('Все истории из базы просмотрены... ждем новые')

      this._command(
        'viewer_waiting'
      )

      await Utils.sleep(500)
      if (!this.controllerState.stopped) return this.run()
      else {
        this._command(
          'viewer_stopped',
          'all_checked'
        )
        return this._log('Просмотрщик остановлен. Все истории просмотрены и собраны полностью')
      }
    }
  }

  async _updateViewerDoc (doc = {}) {
    return this.viewers.updateOne({
      _id: doc._id
    }, {
      $set: doc
    })
  }
}

module.exports = Viewer
