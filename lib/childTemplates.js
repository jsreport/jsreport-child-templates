/*!
 * Copyright(c) 2018 Jan Blaha
 *
 * Extension allowing to assemble and render template using other child templates.
 * Syntax is {#child [template name]}
 */

const path = require('path')
const fs = require('fs')
const extend = require('node.extend.without.arrays')
const Promise = require('bluebird')
const asyncReplace = Promise.promisify(require('async-replace-with-limit'))
const staticHelpers = require('../static/helpers')
const vm = require('vm')

const readFileAsync = Promise.promisify(fs.readFile)

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
        let separator

        if (p.indexOf('$=') !== -1) {
          separator = '$='
        } else {
          separator = '='
        }

        const keys = p.slice(0, p.indexOf(separator)).split('.')
        const rawValue = p.slice(p.indexOf(separator) + separator.length)
        let value

        if (separator === '$=') {
          value = staticHelpers.childTemplateParseData(rawValue)
        } else {
          value = JSON.parse(`"${rawValue}"`)
        }

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

module.exports = function (reporter, definition) {
  reporter.addRequestContextMetaConfig('childsCircleCache', { sandboxHidden: true })

  if (reporter.compilation) {
    reporter.compilation.resource('childTemplates-helpers.js', path.join(__dirname, '../static', 'helpers.js'))
  }

  reporter.beforeRenderListeners.add(definition.name, this, (request, response) => {
    return evaluateChildTemplates(reporter, request, response, { evaluateInTemplateContent: true })
  })

  reporter.beforeRenderListeners.insert({ after: definition.name }, `${definition.name}-helpers`, async (req) => {
    let helpersScript

    if (reporter.execution) {
      helpersScript = reporter.execution.resource('childTemplates-helpers.js')
    } else {
      helpersScript = await readFileAsync(path.join(__dirname, '../', 'static', 'helpers.js'), 'utf8')
    }

    if (req.template.helpers && typeof req.template.helpers === 'object') {
      // this is the case when the jsreport is used with in-process strategy
      // and additinal helpers are passed as object
      // in this case we need to merge in child template helpers
      return vm.runInNewContext(helpersScript, req.template.helpers)
    }

    req.template.helpers = helpersScript + '\n' + (req.template.helpers || '')
  })

  reporter.afterTemplatingEnginesExecutedListeners.add(definition.name, this, (request, response) => {
    return evaluateChildTemplates(reporter, request, response, { evaluateInTemplateContent: false })
  })

  reporter.childTemplates = {
    evaluateChildTemplates: (...args) => evaluateChildTemplates(reporter, ...args)
  }

  async function evaluateChildTemplates (reporter, request, response, options) {
    const childTemplateRegexp = /{#child ([^{}]*)}/g
    let evaluateInTemplateContent
    let parallelLimit

    if (typeof options === 'boolean') {
      evaluateInTemplateContent = options
    } else {
      evaluateInTemplateContent = options.evaluateInTemplateContent
      parallelLimit = options.parallelLimit
    }

    if (evaluateInTemplateContent == null) {
      evaluateInTemplateContent = false
    }

    if (parallelLimit == null) {
      parallelLimit = definition.options.parallelLimit
    }

    request.context.childsCircleCache = request.context.childsCircleCache || {}

    async function convert (str, p1, offset, s) {
      const templatePath = (p1.indexOf(' @') !== -1) ? p1.substring(0, p1.indexOf(' @')) : p1
      const hash = hashCode(s + offset)

      if (request.context.childsCircleCache[p1] && request.context.childsCircleCache[p1][hash] && request.context.isChildRequest) {
        throw reporter.createError(`circle in using child template ${templatePath}`, {
          weak: true,
          statusCode: 403
        })
      }

      if (!request.context.childsCircleCache[p1]) {
        request.context.childsCircleCache[p1] = {}
      }

      request.context.childsCircleCache[p1][hash] = true

      const folder = await reporter.folders.resolveFolderFromPath(templatePath, request)
      const templateNameIsPath = templatePath.indexOf('/') !== -1
      const pathParts = templatePath.split('/').filter((p) => p)

      if (pathParts.length === 0) {
        throw reporter.createError('Invalid template path, path should target something', {
          statusCode: 400,
          weak: true
        })
      }

      const templateName = [...pathParts].pop()

      const q = {
        name: templateName
      }

      if (folder) {
        q.folder = {
          shortid: folder.shortid
        }
      } else if (
        !folder &&
        ((templatePath.startsWith('/') && pathParts.length === 1) ||
        (request && request.context && request.context.currentFolderPath === '/'))
      ) {
        q.folder = null
      }

      let templates = await reporter.documentStore.collection('templates').find(q, request)

      if (!templateNameIsPath && q.hasOwnProperty('folder') && templates.length === 0) {
        delete q.folder
        templates = await reporter.documentStore.collection('templates').find(q, request)
      }

      let template

      if (templates.length > 1) {
        throw reporter.createError(`Duplicated templates found for ${templateName}`, {
          statusCode: 400,
          weak: true
        })
      }

      if (templates.length === 1) {
        template = templates[0]
      }

      if (!template) {
        reporter.logger.debug(`Child template "${templatePath}" was not found, skipping.`)
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

    const result = await asyncReplace({
      string: strToReplace,
      parallelLimit
    }, childTemplateRegexp, (str, p1, offset, s, done) => Promise.resolve(convert(str, p1, offset, s)).asCallback(done))

    if (evaluateInTemplateContent) {
      request.template.content = result
      return
    }

    response.content = Buffer.from(result)
  }
}
