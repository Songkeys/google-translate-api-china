var querystring = require('querystring');

var got = require('got');
var safeEval = require('safe-eval');
var token = require('./token');

var languages = require('./languages');

function _translate(text, opts) {
    opts = opts || {};

    var e;
    [opts.from, opts.to].forEach(function (lang) {
        if (lang && !languages.isSupported(lang)) {
            e = new Error();
            e.code = 400;
            e.message = 'The language \'' + lang + '\' is not supported';
        }
    });
    if (e) {
        return new Promise(function (resolve, reject) {
            reject(e);
        });
    }

    opts.from = opts.from || 'auto';
    opts.to = opts.to || 'en';

    opts.from = languages.getCode(opts.from);
    opts.to = languages.getCode(opts.to);

    return token.get(text).then(function (token) {
        var url = 'https://translate.google.cn/translate_a/single';
        var data = {
            client: 't',
            sl: opts.from,
            tl: opts.to,
            hl: opts.to,
            dt: ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
            ie: 'UTF-8',
            oe: 'UTF-8',
            otf: 1,
            ssel: 0,
            tsel: 0,
            kc: 7,
            q: text
        };
        data[token.name] = token.value;
        var fullUrl = url + '?' + querystring.stringify(data);
        if (fullUrl.length > 2083) {
            delete data.q;
            return [
                url + '?' + querystring.stringify(data),
                {method: 'POST', body: {q: text}}
            ];
        }
        return [fullUrl];
    }).then(function (url) {
        return got.apply(got, url).then(function (res) {
            var result = {
                text: '',
                from: {
                    language: {
                        didYouMean: false,
                        iso: ''
                    },
                    text: {
                        autoCorrected: false,
                        value: '',
                        didYouMean: false
                    }
                },
                raw: ''
            };

            if (opts.raw) {
                result.raw = res.body;
            }

            var body = safeEval(res.body);
            body[0].forEach(function (obj) {
                if (obj[0]) {
                    result.text += obj[0];
                }
            });

            if (body[2] === body[8][0][0]) {
                result.from.language.iso = body[2];
            } else {
                result.from.language.didYouMean = true;
                result.from.language.iso = body[8][0][0];
            }

            if (body[7] && body[7][0]) {
                var str = body[7][0];

                str = str.replace(/<b><i>/g, '[');
                str = str.replace(/<\/i><\/b>/g, ']');

                result.from.text.value = str;

                if (body[7][5] === true) {
                    result.from.text.autoCorrected = true;
                } else {
                    result.from.text.didYouMean = true;
                }
            }

            return result;
        }).catch(function (err) {
            var e;
            e = new Error();
            if (err.statusCode !== undefined && err.statusCode !== 200) {
                e.code = 'BAD_REQUEST';
                e.message = err;
            } else {
                e.code = 'BAD_NETWORK';
                e.message = err;
            }
            throw e;
        });
    });
}

async function translate(text, opts) {
  if (text.length < 5000) {
    return await _translate(text, opts)
  } else {
    const chunkString = str => str.match(/(.|[\r\n]){1,5000}/g)
    const chunks = chunkString(text)
    const resArr = await Promise.all(chunks.map(c => _translate(c, opts)))
    let res = JSON.parse(JSON.stringify(resArr[0]))
    res.text = ''
    resArr.forEach(el => {
      res.text = res.text + el.text
    })
    return Promise.resolve(res)
  }
}

module.exports = translate;
module.exports.languages = languages;
