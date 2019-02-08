const easyvk = require('easyvk')
const path = require('path')

class Viewer {

  constructor (viewerConfig = {}) {
    
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

    return true
  }

}


module.exports = Viewer