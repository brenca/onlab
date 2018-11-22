const EventEmitter = require('events')
const spawn = require('threads').spawn

const thread = spawn((data, done) => {
  if (data.task === 'setup') {
    this.dirname = data.dirname
  }

  const path = require('path')
  const req = name => {
    return require(path.resolve(this.dirname, name))
  }

  switch (data.task) {
    case 'setup': {
      const CLang = req('./c2.js')
      this.CLang = CLang.fromBNF()
      done()
    } break
    case 'buildSPPF': {
      const { Serializable } = req('../lib/serializable')
      const sppf = this.CLang.buildSPPF(data.code)
      done({ sppf: Serializable.serialize(sppf) })
    } break
    default:
      done()
  }
})

const CLang = require('./c2.js')
const { Serializable } = require('../lib/serializable')

class ThreadedCLang extends EventEmitter {
  constructor() {
    super()

    this.clang = new CLang()
    this.$ready = false
    thread.send({ dirname: __dirname, task: 'setup' }).promise().then(() => {
      this.$ready = true
      this.emit('ready')
    }).catch(err => {
      this.emit('error', err)
    })
  }

  get ready() {
    return this.$ready
  }

  async buildSPPF(code) {
    const data = await thread.send({ task: 'buildSPPF', code }).promise()
    return Serializable.deserialize(data.sppf)
  }

  async execute(code) {
    const sppf = await this.buildSPPF(code)
    return this.clang.executeSPPF(sppf)
  }

  end() {
    thread.kill()
  }
}

module.exports = ThreadedCLang
