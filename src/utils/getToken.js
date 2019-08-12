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

async function main (vk, {tokenPath}) {
  console.log(vk.session.access_token); // Выводим токен в лог
  return require('fs').writeFileSync(tokenPath, vk.session.access_token);
}

async function logInWith2Auth (params, data) {
  return new Promise((needValidate) => {

  	function relogIn (_2faCode = "", captcha={}) {
  	  if (_2faCode) params.code = _2faCode;
      if (captcha.key) params.captcha_key = captcha.key;
      if (captcha.sid) params.captcha_sid = captcha.sid;
  	  easyvk(params).then((vk) => {
        return main(vk, data);
      }).catch((err) => {
        console.log(err)
    		if (!err.easyvk_error) {
    		  if (
            err.error_code === "need_validation" || 
            err.error_code === 14 || 
            err.error_code === "need_captcha") {
      			return needValidate({
      			  err: err,
      			  relogIn: relogIn
      			});
    		  }
    		}
  	  })
  	}

  	relogIn()

  })
}

function getToken (uName=username, pass=password, tokenPath=TOKEN_PATH) {
  logInWith2Auth({
    username: uName,
    password: pass,
    reauth: true,
    save_session: false
  }, {tokenPath}).then(({err: error, relogIn}) => {

    console.log(error.validation_type);

    rl.question(error.error + ":  ", (answer) => {
      let code = answer;
      
      let captcha = {
        key: answer,
        sid: error.captcha_sid
      }

      relogIn(code);

      rl.close();
    });

  })
}


module.exports = getToken;