const crypto = require('crypto')
const fast = require('./faster')

const SubclassMap = { }

class SerializedData {
  constructor(CNAME, id, data) {
    this.CNAME = CNAME
    this.SID = id
    this.data = data
  }

  fullJSON() {
    return {
      CNAME: this.CNAME,
      SID: this.SID,
      DATA: this.data
    }
  }

  referenceJSON() {
    return {
      CNAME: this.CNAME,
      SID: this.SID,
      REF: 1
    }
  }
}

class Serializable {
  constructor() {
    if (!SubclassMap[this.constructor.name]) {
      throw new Error(`Please register '${this.constructor.name}' ` +
        `with Serializable.registerSubclass`)
    }

    const randomBytes = crypto.randomBytes(20).toString('hex')
    this.SID = crypto.createHash('md5').update(randomBytes).digest('hex')
  }

  toJSON() {
    return new SerializedData(
      this.constructor.name,
      this.SID,
      this.serialize()
    )
  }

  serialize() {
    return fast.reduce(Object.keys(this), (a, key) => {
      if (key === 'SID') {
        return a
      }

      a[key] = this[key]
      return a
    }, { })
  }

  equals(other) {
    return other !== undefined && other !== null &&
      this.SID === other.SID
  }

  static serialize(objects) {
    const map = { }
    const json = JSON.stringify(objects, (key, value) => {
      if (value instanceof SerializedData) {
        if (map[value.SID] !== undefined) {
          return value.referenceJSON()
        } else {
          map[value.SID] = true
          return value.fullJSON()
        }
      }

      return value
    })

    return json
  }

  static deserialize(json) {
    const map = { }

    const objects = JSON.parse(json, (key, value) => {
      if (value !== null && typeof value === 'object') {
        if (value.SID === undefined || value.CNAME === undefined) {
          return value
        } else {
          if (map[value.SID]) {
            if (value.REF === undefined) {
              const revived = map[value.SID]
              fast.forEach(Object.keys(value.DATA),
                key => revived[key] = value.DATA[key]
              )
              return map[value.SID]
            } else {
              return map[value.SID]
            }
          } else if (value.REF === 1) {
            map[value.SID] = new SubclassMap[value.CNAME]()
            return map[value.SID]
          } else {
            const revived = new SubclassMap[value.CNAME]()
            fast.forEach(Object.keys(value.DATA),
              key => revived[key] = value.DATA[key]
            )
            map[value.SID] = revived
            return map[value.SID]
          }
        }
      }

      return value
    })

    return objects
  }

  static registerSubclass(subclass) {
    SubclassMap[subclass.name] = subclass
  }
}

class Test extends Serializable {
  constructor(v) {
    super()
    this.v = v
  }

  toString() {
    return this.v
  }
}
Serializable.registerSubclass(Test)

class SLArray extends Array {
  constructor() {
    super(...arguments)

    const randomBytes = crypto.randomBytes(20).toString('hex')
    this.ID = crypto.createHash('md5').update(randomBytes).digest('hex')

    this._parent = null
    this.lookupMap = new Proxy({ }, {
      set: (function(target, index, value) {
        if (!target[index]) {
          target[index] = [value]
        } else {
          target[index].push(value)
        }

        if (this.parent) {
          this.parent.addedTo(this, this[value])
        }

        return target
      }).bind(this)
    })
    this.subarrayMap = { }

    if (this.length !== arguments[0]) {
      const args = [...arguments]
      args.forEach((v, i) => this.add(v, i))
    }

    return new Proxy(this, {
      set: (function(target, i, value) {
        const ret = Reflect.set(...arguments)

        const index = parseInt(i)
        if (!Number.isNaN(index)) {
          this.add(value, index)
        }

        return ret
      }).bind(this)
    })
  }

  add(value, index) {
    if (value instanceof SLArray) {
      this.subarrayMap[value.ID] = index
      value.parent = this
    } else if (value.SID !== undefined) {
      this.lookupMap[value.SID] = index
    }
  }

  get parent() {
    return this._parent
  }

  set parent(parent) {
    Object.keys(this.lookupMap).forEach(key => {
      parent.addedTo(this, this[this.lookupMap[key]])
    })
    this._parent = parent
  }

  addedTo(subarray, what) {
    this.add(what, this.subarrayMap[subarray.ID])
  }

  push(value) {
    this[this.length] = value
  }

  indexOfItem(value) {
    return this.lookupMap[value.SID]
        ? this.lookupMap[value.SID][0]
        : -1
  }
}
// 
// const a = new Test(1)
// const b = new Test(1)
// const c = new Test(1)
// const d = new Test(1)
// const e = new Test(1)
// const f = new Test(1)
// const g = new Test(1)
//
// const x = new SLArray(a, b, c)
// const y = new SLArray(c, d, e)
// const z = new SLArray(e, f, a)
// const w = new SLArray(d, b, f)
//
// const m = new SLArray(x, y, z, w)
//
// console.log(m.lookupMap);
//
// console.log(m.indexOfItem(g));
// w.push(g)
// console.log(m.lookupMap);
// console.log(m.indexOfItem(g));

module.exports = { Serializable, SLArray }
