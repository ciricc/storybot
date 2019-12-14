const easyvk = require('easyvk')
const path = require('path')
const Utils = require('./Utils')
const colors = require('colors')
const fs = require('fs')

const LIMIT_PER_2_SECONDS = 5;

class Viewer {
  constructor (viewerConfig = {}) {
    this.botName = ''

    let hash = viewerConfig.account.username;
    
    if (!hash) {
      hash = viewerConfig.account.access_token.slice(0,18);
    } 

    if (!hash) hash = '';

    let sessionFileHash = '.vk-session-' + hash.replace(/\+|@/g, '');

    this.paramsEasyVK = {
      username: viewerConfig.account.username,
      password: viewerConfig.account.password,
      reauth: viewerConfig.reauth,
      proxy: viewerConfig.proxy,
      userAgent: viewerConfig.userAgent,
      session_file: './' + sessionFileHash,
      save_session: true,
      captcha_sid: viewerConfig.captchaSid,
      captcha_key: viewerConfig.captchaKey,
      code: viewerConfig.code,
      debug: viewerConfig.easyvkDebug,
      access_token: viewerConfig.account.access_token
    }

    this.controllerState = {}
    this.config = viewerConfig
    this.stopped = false;
  }

  async init () {
    let vk = await easyvk(this.paramsEasyVK)
    let lastRequest = 0;
    
    vk.use(async ({thread, next}) => {
      fs.appendFileSync('time.log', 'Making request after ' + (new Date().getTime() - lastRequest) + '\n')
      lastRequest = new Date().getTime();
      return await next();
    });

    if (!vk.session.user_id) throw new Error('Why are you using not a user account? You need setup Viewer correctly')

    this._vk = vk

    this.viewers = this.db('viewers')
    this.users = this.db('users')

    let count = await this.db('viewers').select(this.db.raw('count(*) as `count`'))
    .where('bot_name', '=', this.botName)
    .andWhere('viewer_id', '=', this._vk.session.user_id)

    count = count[0].count;

    if (!count) {
      await this.db('viewers').insert({
        'bot_name': this.botName,
        'viewer_id': this._vk.session.user_id,
        'last_user_checked_id': '',
        'viewed': 0,
        'viewed_accounts': 0
      }).catch(console.log)
    }

    this.viewerDoc = await this.db('viewers').select('*')
    .where('bot_name', '=', this.botName)
    .andWhere('viewer_id', '=', this._vk.session.user_id);
    
    this.viewerDoc = this.viewerDoc[0];

    this.checked = {}

    this.run()

    return true
  }

  async run () {
    let query = this.db('users').select('*')
    .where('bot_name', this.botName)
    .orderBy('id', 'ASC')

    if (this.viewerDoc.last_user_checked_id) {
      query = this.db('users')
      .select('*')
      .where('bot_name', this.botName)
      .andWhere('id', '>', this.viewerDoc.last_user_checked_id)
      .orderBy('id', 'ASC')
    }

    let users = await query;

    // users = await users.toArray()

    let _users = []
    users.forEach((user, i) => {
      let stids = user.stids.split(',');
      
      if (this.config.limitStoriesForUser) {
        if (this.config.startFromEnd) {
          stids = stids.splice(-this.config.limitStoriesForUser)
        } else {
          stids = stids.slice(0, this.config.limitStoriesForUser)
        }
      }
      stids.forEach((stid) => {
        _users.push(user.vk_id + '_' + stid)
      })
    })

    users = _users

    async function loop () {
      return new Promise((resolve, reject) => {
        let self = this
        if (this.stopped) return
        // Need uset more than one user
        let nowWatching = users.slice(0, LIMIT_PER_2_SECONDS)
        let countChecked = 0

        nowWatching.forEach((usr) => {
          let uid = usr.split('_')[0]

          if (!self.checked[uid]) {
            countChecked += 1
            self.checked[uid] = true
          }
        })


        let realObjects = [];

        nowWatching = nowWatching.map((a) => {
          realObjects.push({
            owner_id: a.split('_')[0],
            story_id: a.split('_')[1]
          })
          return easyvk.static.createExecute('stories.markSeen', {
            owner_id: a.split('_')[0],
            story_id: a.split('_')[1]
          })
        })

        let _nowW = Array.from(nowWatching);
        nowWatching = nowWatching.join(',')


        this._log('Читаем истории (' + _nowW.length + ')')
        self._command(
          'viewer_begin_reading',
          nowWatching
        )

        async function retry () {
          self._vk.post('execute', {
            code: `return [${nowWatching}];`,
            v: '5.101'
          }).then(async ({vkr}) => {
            self._log(vkr)
            let checked = users.splice(0, LIMIT_PER_2_SECONDS)
            fs.appendFileSync('logout.log', checked + ' checked\n')
            if (checked.length) {
              let uI = await self.db('users')
              .select('*')
              .where('vk_id', '=', Number(checked[checked.length - 1].split('_')[0]))
              .andWhere('bot_name', '=', self.botName)
              
              uI = uI[0]

              uI = uI.id
              
              fs.appendFileSync('logout.log', uI + '\n')

              self.viewerDoc.last_user_checked_id = uI
              self.viewerDoc.viewed += nowWatching.length
              self.viewerDoc.viewed_accounts += countChecked

              self._log('Проверили истории тут: vk.com/id' + checked[checked.length - 1].split('_')[0])

              self._command(
                'viewer_checked_stories',
                nowWatching,
                vkr
              )

              await self._updateViewerDoc(self.viewerDoc)
            }
            return nextUsers()
          }).catch(async e => {
            self._log('Ждем восстановления сервера...');
            await Utils.sleep(1000);
            return retry();
          })
        }

        return retry();
        async function nextUsers () {
          if (!users.length) {
            self._log('Все истории из базы просмотрены... ждем новые'.green, JSON.stringify(self.controllerState))

            await Utils.sleep(2000)
            self._log('Новый цикл!')
            return self.run()
            return resolve(true)
          }

          setTimeout(() => {
            return loop.call(self)
          }, 2000)
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
      this._log('Все истории из базы просмотрены... ждем новые (' + new Date().getTime() + ')')

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
    return this.db('viewers')
    .where('id', '=', doc.id)
    .update(doc)
  }

  stop () {
    this.stopped = true;
    this._command(
      'viewer_stopped',
      'stop_command'
    )
  }
}

module.exports = Viewer

process.on('unhandledRejection', console.error)