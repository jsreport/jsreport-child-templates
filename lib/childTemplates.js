/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Extension allowing to assemble and render template using other child templates.
 * Syntax is {#child [template name]}
 */

const extend = require('node.extend')
const Promise = require('bluebird')
const asyncReplace = Promise.promisify(require('async-replace'))

const childTemplateRegexp = /{#child ([^{}]{0,500})}/g

function hashCode (str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash += str.charCodeAt(i)
  }
  return hash
}

function applyParameters (p1, templateName, req) {
  if (p1.indexOf(' @') !== -1) {
    try {
      const modifications = {}

      const params = p1.replace(templateName, '').split(' @')
      params.shift()

      params.forEach(function (p) {
        const keys = p.split('=')[0].split('.')
        const value = JSON.parse('"' + p.split('=')[1] + '"')
        let modificationsIterator = modifications

        const lastProperty = keys[keys.length - 1]
        keys.pop()

        keys.forEach((k) => {
          modificationsIterator = modificationsIterator[k] = modificationsIterator[k] || {}
        })
        modificationsIterator[lastProperty] = value
      })

      extend(true, req, modifications)
    } catch (e) {
      throw new Error('Unable to parse child template params ' + p1)
    }
  }
}

async function evaluateChildTemplates (reporter, request, response, evaluateInTemplateContent) {
  request.context.childsCircleCache = request.context.childsCircleCache || {}

  async function convert (str, p1, offset, s) {
    const templateName = (p1.indexOf(' @') !== -1) ? p1.substring(0, p1.indexOf(' @')) : p1
    const hash = hashCode(s + offset)
    if (request.context.childsCircleCache[p1] && request.context.childsCircleCache[p1][hash] && request.options.isChildRequest) {
      const e = new Error('circle in using child template ' + templateName)
      e.weak = true
      throw e
    }

    if (!request.context.childsCircleCache[p1]) {
      request.context.childsCircleCache[p1] = {}
    }

    request.context.childsCircleCache[p1][hash] = true

    const template = await reporter.documentStore.collection('templates').findOne({ name: templateName }, request)
    if (!template) {
      reporter.logger.debug('Child template "' + templateName + '" was not found, skipping.')
      return null
    }
    const req = {
      template
    }

    applyParameters(p1, templateName, req)

    reporter.logger.debug('Rendering child template ' + templateName)
    const resp = await reporter.render(req, request)
    return resp.content.toString()
  }

  const strToReplace = evaluateInTemplateContent ? request.template.content : response.content.toString()

  const result = await asyncReplace(strToReplace, childTemplateRegexp,
    (str, p1, offset, s, done) => Promise.resolve(convert(str, p1, offset, s)).asCallback(done))

  if (evaluateInTemplateContent) {
    request.template.content = result
    return
  }

  response.content = Buffer.from(result)
}

module.exports = function (reporter, definition) {
  reporter.beforeRenderListeners.add(definition.name, this, (request, response) => evaluateChildTemplates(reporter, request, response, true))
  reporter.afterTemplatingEnginesExecutedListeners.add(definition.name, this, (request, response) => evaluateChildTemplates(reporter, request, response, false))

  reporter.childTemplates = {
    evaluateChildTemplates: (...args) => evaluateChildTemplates(reporter, ...args)
  }
}
