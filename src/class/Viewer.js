const easyvk = require('easyvk')
const path = require('path')
const Utils = require('./Utils')

class Viewer {

  constructor (viewerConfig = {}) {
    
    this.botName = ''

    this.paramsEasyVK = {
      username: viewerConfig.account.username,
      password: viewerConfig.account.password,
      reauth: viewerConfig.reauth,
      proxy: viewerConfig.proxy,
      userAgent: viewerConfig.userAgent,
      session_file: path.join(__dirname, '..', 'cache', '.vk-session-' + viewerConfig.account.username),
      save_session: true,
      captcha_sid: viewerConfig.captchaSid,
      captcha_key: viewerConfig.captchaKey
    }

  }

  async init () {

    let vk = await easyvk(this.paramsEasyVK);
      
    if (!vk.session.user_id) throw new Error('Why are you using not a user account? You need setup Viewer correctly')

    let {client} = await vk.http.loginByForm({
      user_agent: this.paramsEasyVK.userAgent,
      cookies: path.join(
        __dirname, '..', 
        'cache',
        'cookies',
        'cookies-' + this.paramsEasyVK.username + '.json')
    })

    this._vk = vk;
    this._client = client;
    
    this.viewers = this.db.collection('viewers')
    this.users = this.db.collection('users')

    let count = await this.viewers.countDocuments({
      $and: [{"bot_name": this.botName}, {"viewer_id": this._vk.session.user_id}]
    })


    if (!count) {
      await this.viewers.insertOne({
        "bot_name": this.botName,
        "viewer_id": this._vk.session.user_id,
        "last_user_checked_id": ""
      })
    }

    this.viewerDoc = await this.viewers.findOne({
      $and: [{"bot_name": this.botName}, {"viewer_id": this._vk.session.user_id}]
    })



    this.run()

    return true
  }

  async run () {

    let query = {
      "bot_name": this.botName
    }


    if (this.viewerDoc.last_user_checked_id) {
      query = {
        $and: [{"bot_name": this.botName}, {"_id": {
          $gt: this.viewerDoc.last_user_checked_id
        }}]
      }
    }


    let users = await this.users.find(query)

    users = await users.toArray()

    users.forEach((user, i) => {
      return users[i] = user.vk+'_'+user.stid
    })

    async function loop () {
      return new Promise((resolve, reject) => {
        
        let self = this

        if (this._client._story_read_hash) {
          // Need uset more than one user
          console.log('Читаем истории (' + users.slice(0, 25).length + ')')
          this._client.__readStory(this._client._story_read_hash, users.slice(0, 25).join(','), 'profile', async (err, res) => {
            let checked = users.splice(0, 25)

            let uI = await self.users.findOne({
              $and: [
                {"vk": Number(checked[checked.length-1].split('_')[0])}, 
                {"bot_name": self.botName}
              ]
            })

            uI = uI._id

            this.viewerDoc.last_user_checked_id = uI;
            self._log('Проверили истории тут: vk.com/id' + checked[checked.length-1].split('_')[0])
            await this._updateViewerDoc(this.viewerDoc)           
            return nextUsers()
          })
          

        } else {
          console.log('Обновляем хеш...')
          
          return this._client.readStories(users[0].split('_')[0]).then((count) => {
            console.log(count.count, users[0].split('_')[0])
            console.log('Прочитали!')
            users.splice(0, 1)
            return nextUsers()
          })
          
        }

        async function nextUsers() {
          
          if (!users.length) {
            self._log('Все истории из базы просмотрены... ждем новые')

            await Utils.sleep(5000)
            console.log('Новый цикл!')
            return self.run()
            return resolve(true)
          }

          setTimeout(() => {
            return loop.call(self)
          }, 1500)
        }

      })
    }

    if (users.length) {
      this._log('Есть новые истории!')
      await loop.call(this)
    } else {
      this._log('Все истории из базы просмотрены... ждем новые')
      await Utils.sleep(5000)
      return this.run()
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