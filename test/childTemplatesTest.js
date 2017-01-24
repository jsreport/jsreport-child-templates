require('should')
var path = require('path')
var Reporter = require('jsreport-core').Reporter

describe('childTemplates', function () {
  var reporter

  beforeEach(function () {
    reporter = new Reporter({
      rootDirectory: path.join(__dirname, '../')
    })

    return reporter.init()
  })

  it('should replace child template mark with its content', function () {
    return reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1}'},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('xx')
      })
    })
  })

  it('should handle multiple templates in one', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{>~a()}}',
      engine: 'jsrender',
      helpers: 'function a() { return \'foo\'; }',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: 'a{#child t1}ba{#child t1}'},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('afoobafoo')
      })
    })
  })

  it('should handle multiple templates in nested one', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{>~a()}}',
      engine: 'jsrender',
      helpers: 'function a() { return \'foo\'; }',
      recipe: 'html',
      name: 't3'
    }).then(function (t) {
      return reporter.documentStore.collection('templates').insert({
        content: '{#child t3}{#child t3}',
        engine: 'jsrender',
        recipe: 'html',
        name: 't2'
      }).then(function (t) {
        var request = {
          template: {content: '{#child t2}'},
          options: {}
        }

        return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
          request.template.content.should.be.eql('foofoo')
        })
      })
    })
  })

  it('should throw when there is circle in templates', function (done) {
    reporter.documentStore.collection('templates').insert({
      content: '{#child t2}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t1) {
      return reporter.documentStore.collection('templates').insert({
        content: '{#child t1}',
        engine: 'jsrender',
        recipe: 'html',
        name: 't2'
      }).then(function (t2) {
        return reporter.render({template: {shortid: t1.shortid}}, {}).then(function () {
          done(new Error('Should throw'))
        })
      })
    }).catch(function (e) {
      e.weak.should.be.ok
      done()
    })
  })

  it('should be able to pass data params to child', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1 @data.foo=xx}'},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('xx')
      })
    })
  })

  it('should be able to pass data nested params to child', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{:foo.a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1 @data.foo.a=xx}'},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('xx')
      })
    })
  })

  it.skip('should be able to pass stringified object as params', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{:foo.a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {
          content: '{#child t1 @data={foo: {"a": "hello"}}}'
        },
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('hello')
      })
    })
  })

  it('should merge in params, not override', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{:main}}{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1 @data.foo=xx}'},
        data: { main: 'main' },
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('mainxx')
      })
    })
  })

  it('should be able to override template properties with params', function () {
    return reporter.documentStore.collection('templates').insert({
      content: 'aaa',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1 @template.content=xx}'},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('xx')
      })
    })
  })

  it('should clone input data passed to child request', function () {
    return reporter.documentStore.collection('templates').insert({
      content: '{{:a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    }).then(function (t) {
      var request = {
        template: {content: '{#child t1 @data.a=1}{#child t1 @data.a=2}'},
        data: {},
        options: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('12')
      })
    })
  })
})
