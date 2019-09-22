let username = process.argv[2];
let password = process.argv[3];

const easyvk = require("easyvk");
const readline = require('readline');
const path = require('path');


const TOKEN_PATH = path.join(__dirname, 'access_token.txt');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main (vk, {tokenPath, resolve}) {
  if (resolve) return resolve(vk.session.access_token)
  console.log(vk.session.access_token); // Выводим токен в лог
  return require('fs').writeFileSync(tokenPath, vk.session.access_token);
}

async function logInWith2Auth (params, data) {
  return new Promise((needValidate) => {

  	function relogIn (_2faCode = "", captcha={}) {
  	  if (_2faCode) params.code = _2faCode;
      if (captcha.key && captcha.sid) params.captcha_key = captcha.key;
      if (captcha.sid) params.captcha_sid = captcha.sid;
  	  easyvk(params).then((vk) => {
        return main(vk, data);
      }).catch((err) => {
        console.log(err);
        let fullError = {};
        try {
          fullError = JSON.parse(err.message)
        } catch (e) {

        }
    		if (!err.easyvk_error) {
    		  if (
            err.error_code === "need_validation" || 
            err.error_code === 14 || 
            fullError.error === "need_captcha") {
      			return needValidate({
      			  err: fullError.error ? fullError : err,
      			  relogIn: relogIn
      			});
    		  }
    		}
  	  })
  	}

  	relogIn()

  })
}

async function getToken (uName=username, pass=password, tokenPath=TOKEN_PATH, output=true) {
  return new Promise((resolve, reject) => {
    let data = {}
    if (!output) data.resolve = resolve;

    return logInWith2Auth({
      username: uName,
      password: pass,
      reauth: true,
      save_session: false
    }, {tokenPath, ...data}).then(({err: error, relogIn}) => {

      console.log(error.validation_type);

      rl.question(error.error + (error.captcha_img ? ` (${error.captcha_img})` : "") + ":  ", (answer) => {
        let code = answer;
        
        let captcha = {
          key: answer,
          sid: error.captcha_sid
        }

        relogIn(code, captcha);

        rl.close();
      });

    })
  })
}


module.exports = getToken;