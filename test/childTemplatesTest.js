require('should')
const jsreport = require('jsreport-core')
const helpers = require('../static/helpers')

describe('childTemplates', () => {
  let reporter

  beforeEach(() => {
    reporter = jsreport({ templatingEngines: { strategy: 'in-process' } })
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
      template: { content: '{#child t1}', engine: 'none', recipe: 'html' }
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
      template: { content: 'a{#child t1}ba{#child t1}', engine: 'none', recipe: 'html' }
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
      template: { content: '{#child t2}', engine: 'none', recipe: 'html' }
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

    return reporter.render({ template: { name: 't1' } }).should.be.rejected()
  })

  it('should be able to pass data params to child', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      template: { content: '{#child t1 @data.foo=xx}', engine: 'none', recipe: 'html' }
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
      template: { content: '{#child t1 @data.foo.a=xx}', engine: 'none', recipe: 'html' }
    }

    const res = await reporter.render(request)
    res.content.toString().should.be.eql('xx')
  })

  it('should be able to pass stringified object as params', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo.a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      template: {
        content: `{#child t1 @data$=${helpers.childTemplateSerializeData({ foo: { a: 'hello' } })}}`,
        engine: 'jsrender',
        recipe: 'html'
      },
      options: {}
    }

    const res = await reporter.render(request)

    res.content.toString().should.be.eql('hello')
  })

  it('should be able to pass stringified object as params using helper', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo.a}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      data: {
        foo: {
          a: 'hello'
        }
      },
      template: {
        content: `{#child t1 @data.foo$={{:~childTemplateSerializeData(foo)}}}`,
        engine: 'jsrender',
        recipe: 'html'
      },
      options: {}
    }

    const res = await reporter.render(request)

    res.content.toString().should.be.eql('hello')
  })

  it('should be able to use normal and stringified object params', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })

    const request = {
      template: {
        content: `a{#child t1 @data.foo=demo}ba{#child t1 @data$=${helpers.childTemplateSerializeData({ foo: 'demo2' })}}ba{#child t1 @data$=${helpers.childTemplateSerializeData({ foo: 'demo' })} @data.foo=demo3}`,
        engine: 'none',
        recipe: 'html'
      }
    }

    const res = await reporter.render(request)

    res.content.toString().should.be.eql('ademobademo2bademo3')
  })

  it('should merge in params, not override', async () => {
    await reporter.documentStore.collection('templates').insert({
      content: '{{:main}}{{:foo}}',
      engine: 'jsrender',
      recipe: 'html',
      name: 't1'
    })
    const request = {
      template: { content: '{#child t1 @data.foo=xx}', engine: 'none', recipe: 'html' },
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
      template: { content: '{#child t1 @data.a=A @data.b=B}', engine: 'none', recipe: 'html' }
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
      template: { content: '{#child t1 @template.content=xx}', engine: 'none', recipe: 'html' }
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
      template: { content: '{#child t1 @data.a=1}{#child t1 @data.a=2}', engine: 'none', recipe: 'html' }
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

  it('should throw error when duplicated results are found', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })
    await reporter.documentStore.collection('folders').insert({
      name: 'folder2',
      shortid: 'folder2'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo',
      recipe: 'html',
      folder: { shortid: 'folder2' }
    })
    await reporter.documentStore.collection('templates').insert({
      name: 't1',
      engine: 'none',
      content: '{#child xxx}',
      recipe: 'html'
    })
    try {
      await reporter.render({
        template: {
          name: 't1'
        }
      })

      throw new Error('should have failed when duplicates are found')
    } catch (e) {
      e.message.includes('Duplicated templates').should.be.true()
    }
  })

  it('should resolve template name using folders absolute path', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      name: 'template',
      folder: {
        shortid: 'folder'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      content: '{#child /folder/template}',
      engine: 'none',
      recipe: 'html',
      name: 't1'
    })

    const res = await reporter.render({
      template: { name: 't1', engine: 'none', recipe: 'html' }
    })
    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template at specifed path when there are others with same name', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo-root',
      recipe: 'html'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 't1',
      engine: 'none',
      content: '{#child /xxx}',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })
    const res = await reporter.render({
      template: {
        name: 't1'
      }
    })

    res.content.toString().should.be.eql('foo-root')
  })

  it('should resolve template just by name no matter its location if there is no other template with same name', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo',
      recipe: 'html'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 't1',
      engine: 'none',
      content: '{#child xxx}',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })
    const res = await reporter.render({
      template: {
        name: 't1'
      }
    })

    res.content.toString().should.be.eql('foo')
  })

  it('should resolve template just by name no matter its location if there is no other template with same name (from anonymous template)', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })
    await reporter.documentStore.collection('templates').insert({
      name: 'xxx',
      engine: 'none',
      content: 'foo',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })
    const res = await reporter.render({
      template: {
        content: '{#child xxx}',
        engine: 'none',
        recipe: 'html'
      }
    })

    res.content.toString().should.be.eql('foo')
  })

  it('should prefer resolving to template that is in same folder level of rendered template', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('templates').insert({
      name: 't1',
      content: 't1',
      engine: 'none',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 't1',
      content: 't1-root',
      engine: 'none',
      recipe: 'html'
    })

    await reporter.documentStore.collection('templates').insert({
      name: 't2',
      content: '{#child t1}',
      engine: 'none',
      recipe: 'html',
      folder: { shortid: 'folder' }
    })

    const res = await reporter.render({
      template: { name: '/folder/t2', engine: 'none', recipe: 'html' }
    })
    res.content.toString().should.be.eql('t1')
  })

  it('should resolve template name using folders absolute path from nested template', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      name: 'template'
    })

    await reporter.documentStore.collection('templates').insert({
      content: '{#child /template}',
      engine: 'none',
      recipe: 'html',
      name: 't1',
      folder: {
        shortid: 'folder'
      }
    })

    const res = await reporter.render({
      template: { name: '/folder/t1', engine: 'none', recipe: 'html' }
    })
    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template name using folders relative path (../template syntax)', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('folders').insert({
      name: 'shared',
      shortid: 'shared'
    })

    await reporter.documentStore.collection('templates').insert({
      content: '{#child ../shared/test}',
      engine: 'none',
      recipe: 'html',
      name: 'template',
      folder: {
        shortid: 'folder'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      name: 'test',
      folder: {
        shortid: 'shared'
      }
    })

    const res = await reporter.render({
      template: { name: 'template' }
    })
    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template name using folders relative path (./nested/template syntax)', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('folders').insert({
      name: 'folder2',
      shortid: 'folder2',
      folder: { shortid: 'folder' }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'template',
      content: '{#child ./folder2/test}',
      engine: 'none',
      recipe: 'html',
      folder: {
        shortid: 'folder'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'test',
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      folder: {
        shortid: 'folder2'
      }
    })

    const res = await reporter.render({
      template: { name: 'template' }
    })

    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template name using folders relative path (./nested/template syntax) from anonymous template', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      name: 'template',
      folder: {
        shortid: 'folder'
      }
    })

    const res = await reporter.render({
      template: { content: '{#child ./folder/template}', engine: 'none', recipe: 'html' }
    })

    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template name using folders relative path (nested/template syntax)', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('folders').insert({
      name: 'folder2',
      shortid: 'folder2',
      folder: { shortid: 'folder' }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'template',
      content: '{#child folder2/test}',
      engine: 'none',
      recipe: 'html',
      folder: {
        shortid: 'folder'
      }
    })

    await reporter.documentStore.collection('templates').insert({
      name: 'test',
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      folder: {
        shortid: 'folder2'
      }
    })

    const res = await reporter.render({
      template: { name: 'template' }
    })
    res.content.toString().should.be.eql('xx')
  })

  it('should resolve template name using folders relative path (nested/template syntax) from anonymous template', async () => {
    await reporter.documentStore.collection('folders').insert({
      name: 'folder',
      shortid: 'folder'
    })

    await reporter.documentStore.collection('templates').insert({
      content: 'xx',
      engine: 'none',
      recipe: 'html',
      name: 'template',
      folder: {
        shortid: 'folder'
      }
    })

    const res = await reporter.render({
      template: { content: '{#child folder/template}', engine: 'none', recipe: 'html' }
    })

    res.content.toString().should.be.eql('xx')
  })

  it('should throw error when using invalid paths', async () => {
    try {
      await reporter.render({
        template: {
          content: '{#child /}',
          engine: 'none',
          recipe: 'html'
        }
      })

      throw new Error('should have failed when passing invalid path')
    } catch (e) {
      e.message.includes('Invalid template path').should.be.true()
    }

    try {
      await reporter.render({
        template: {
          content: '{#child ///}',
          engine: 'none',
          recipe: 'html'
        }
      })

      throw new Error('should have failed when passing invalid path')
    } catch (e) {
      e.message.includes('Invalid template path').should.be.true()
    }
  })
})
