class Utils {

  static async asyncLoop (iterations, func, callback) {
    return new Promise((resolve, reject) => {
      var index = 0;
      var done = false;
      var loop = {
        next: function() {
          if (done) return;
          if (index < iterations) {
            index++;
            func(loop);
          } else {
            done = true;
            if (callback) {
              callback();
            } else {
              resolve(true);
            }
          }
        },

        get iteration () {
          return index - 1;
        },
        break: function() {
          done = true;
          if (callback) {
             callback();
          } else {
            resolve(true);
          }
        }
      };
      loop.next();
      return loop;
    })
  }

  static createExecute (method = "", params = {}) {
    return `API.${method}(${JSON.stringify(params)})`
  }


  static sleep (ms = 0) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        return resolve(true)
      }, ms)
    })
  }

  static rand (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

module.exports = Utils