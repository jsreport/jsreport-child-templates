
module.exports = {
  'name': 'child-templates',
  'main': 'lib/childTemplates.js',
  'dependencies': ['templates'],
  'hasPublicPart': false,
  'optionsSchema': {
    extensions: {
      'child-templates': {
        type: 'object',
        properties: {
          parallelLimit: {
            type: 'number',
            default: 2,
            description: 'specifies the number of child templates that can be rendered in parallel at a time'
          }
        }
      }
    }
  }
}
