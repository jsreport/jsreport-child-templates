require('should')
const jsreport = require('jsreport-core')

describe('childTemplates', () => {
  let reporter

  beforeEach(() => {
    reporter = jsreport({ tasks: { strategy: 'in-process' } })
    reporter.use(require('../')())
    reporter.use(require('jsreport-templates')())
    reporter.use(require('jsreport-jsrender')())

    return reporter.init()
  })

  it('should replace child template mark with its content', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      template: {content: '{#child t1}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('xx')
  })

  it('should handle multiple templates in one', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{>~a()}}',
      engine: 'jsrender',
      helpers: 'function a() { return \'foo\'; }',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: 'a{#child t1}ba{#child t1}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('afoobafoo')
  })

  it('should handle multiple templates in nested one', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{>~a()}}',
      engine: 'jsrender',
      helpers: 'function a() { return \'foo\'; }',
      recipe: 'html',
      name: 't3'
    })

    await reporter.documentStore.collection('templates').insert({
      content: '{#child t3}{#child t3}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't2'
    })
    const request = {
      template: {content: '{#child t2}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('foofoo')
  })

  it('should throw when there is circle in templates', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{#child t2}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    await reporter.documentStore.collection('templates').insert({
      content: '{#child t1}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't2'
    })

    return reporter.render({template: {name: 't1'}}).should.be.rejected()
  })

  it('should be able to pass data params to child', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      template: {content: '{#child t1 @data.foo=xx}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('xx')
  })

  it('should be able to pass data nested params to child', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo.a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: '{#child t1 @data.foo.a=xx}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('xx')
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
        options: {},
        context: {}
      }

      return reporter.childTemplates.evaluateChildTemplates(request, {}, true).then(function () {
        request.template.content.should.be.eql('hello')
      })
    })
  })

  it('should merge in params, not override', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:main}}{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: '{#child t1 @data.foo=xx}', engine: 'none', recipe: 'html'},
      data: { main: 'main' }
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('mainxx')
  })

  it('should work with multiple data params', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:a}}{{:b}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: '{#child t1 @data.a=A @data.b=B}', engine: 'none', recipe: 'html'}
    }

    const res = await await reporter.render(request)
    res.content.toString().should.be.eql('AB')
  })

  it('should be able to override template properties with params', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: 'aaa',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: '{#child t1 @template.content=xx}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('xx')
  })

  it('should clone input data passed to child request', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: {content: '{#child t1 @data.a=1}{#child t1 @data.a=2}', engine: 'none', recipe: 'html'}
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('12')
  })

  it('should collect logs from child template to the parent', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:~a()}}',
      helpers: `function a() { console.log('hello'); }`,
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = { template: { content: '{#child t1}', engine: 'none', recipe: 'html' } }

    const res = await reporter.render(request)
    res.meta.logs.map(l => l.message).should.containEql('hello')
  })
})
