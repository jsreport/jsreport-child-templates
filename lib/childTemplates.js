/*!
 * Copyright(c) 2014 Jan Blaha
 *
 * Extension allowing to assemble and render template using other child templates.
 * Syntax is {#child [template name]}
 */

var extend = require('node.extend')
var Promise = require('bluebird')
var asyncReplace = Promise.promisify(require('async-replace'))

var ChildTemplates = function (reporter, definition) {
  this.reporter = reporter
  this.definition = definition

  var self = this
  reporter.beforeRenderListeners.add(definition.name, this, function (request, response) {
    return self.evaluateChildTemplates(request, response, true)
  })

  reporter.afterTemplatingEnginesExecutedListeners.add(definition.name, this, function (request, response) {
    return self.evaluateChildTemplates(request, response, false)
  })
}

function extendRequest (skipData, target, request) {
  var body = request.body
  request.body = null

  if (skipData) {
    var data = extend(false, {}, request.data)
    request.data = null
  }

  var req = extend(true, target, request)

  request.body = req.body = body
  if (skipData) {
    request.data = req.data = data
  }

  return req
}

ChildTemplates.prototype.evaluateChildTemplates = function (request, response, evaluateInTemplateContent) {
  var self = this

  request.childsCircleCache = request.childsCircleCache || {}

  function hashCode (str) {
    var hash = 0
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i)
      hash += ch
    }
    return hash
  }

  function convert (str, p1, offset, s, done) {
    var templateName = (p1.indexOf(' @') !== -1) ? p1.substring(0, p1.indexOf(' @')) : p1
    var hash = hashCode(s + offset)
    if (request.childsCircleCache[p1] && request.childsCircleCache[p1][hash] && request.options.isChildRequest) {
      var e = new Error('circle in using child template ' + templateName)
      e.weak = true
      return done(e)
    }

    if (!request.childsCircleCache[p1]) {
      request.childsCircleCache[p1] = {}
    }

    request.childsCircleCache[p1][hash] = true

    self.reporter.documentStore.collection('templates').find({ name: templateName }, request).then(function (res) {
      if (res.length < 1) {
        self.reporter.logger.debug('Child template ' + templateName + ' was not found, skipping.')
        return done(null)
      }

      var req = extendRequest(true, {}, request)

      req.template = res[0]
      req.options.isChildRequest = true

      if (p1.indexOf(' @') !== -1) {
        try {
          var modifications = {}

          var params = p1.replace(templateName, '').split(' @')
          params.shift()

          params.forEach(function (p) {
            var keys = p.split('=')[0].split('.')
            var value = JSON.parse('\"' + p.split('=')[1] + '\"')
            var foo = modifications

            var property = keys[keys.length - 1]
            keys.pop()

            keys.forEach(function (k) {
              foo = foo[k] = {}
            })
            foo[property] = value
          })

          extendRequest(false, req, modifications)
        } catch (e) {
          throw new Error('Unable to parse child template params ' + p1)
        }
      }

      self.reporter.logger.debug('Rendering child template ' + templateName)
      return self.reporter.render(req).then(function (resp) {
        done(null, resp.content.toString())
      })
    }).catch(done)
  }

  var test = /{#child ([^{}]{0,500})}/g

  return asyncReplace(evaluateInTemplateContent ? request.template.content : response.content.toString(), test, convert).then(function (result) {
    if (evaluateInTemplateContent) {
      request.template.content = result
      return
    }

    response.content = new Buffer(result)
  })
}

module.exports = function (reporter, definition) {
  reporter.childTemplates = new ChildTemplates(reporter, definition)
}
