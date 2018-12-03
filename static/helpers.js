/* eslint no-unused-vars: 1 */
/* eslint no-new-func: 0 */
/* *global __rootDirectory */
;(function (global) {
  function childTemplateSerializeData (data) {
    return Buffer.from(JSON.stringify(data)).toString('base64')
  }

  function childTemplateParseData (dataStr) {
    return JSON.parse(Buffer.from(dataStr, 'base64').toString())
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports.childTemplateSerializeData = childTemplateSerializeData
    module.exports.childTemplateParseData = childTemplateParseData
  } else {
    global.childTemplateSerializeData = childTemplateSerializeData
    global.childTemplateParseData = childTemplateParseData
  }
})(this)
