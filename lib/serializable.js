const uuid = require('uuid/v4')
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
  constructor(sid) {
    if (!SubclassMap[this.constructor.name]) {
      throw new Error(`Please register '${this.constructor.name}' ` +
        `with Serializable.registerSubclass`)
    }

    this.SID = sid !== undefined ? sid : uuid()
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

      if (key[0] !== '_') {
        a[key] = this[key]
      }

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

class SLArray extends Array {
  constructor() {
    super(...arguments)

    this.ID = uuid()

    this.PARENT = null
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
      fast.forEach(arguments, (v, i) => this.add(v, i))
    }

    return new Proxy(this, {
      set: (function(target, i, value) {
        const ret = Reflect.set(target, i, value)

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
    return this.PARENT
  }

  set parent(parent) {
    Object.keys(this.lookupMap).forEach(key => {
      parent.addedTo(this, this[this.lookupMap[key]])
    })
    this.PARENT = parent
  }

  addedTo(subarray, what) {
    this.add(what, this.subarrayMap[subarray.ID])
  }

  push(value) {
    this[this.length] = value
  }

  indexOfItem(value) {
    const indexes = this.lookupMap[value.SID]
    if (indexes !== undefined) {
      return this.lookupMap[value.SID][0]
    } else {
      return -1
    }
  }
}

class SLSet extends SLArray {
  constructor() {
    super(...arguments)

    return new Proxy(this, {
      set: (function(target, i, value) {
        const index = target.indexOfItem(value)
        if (index < 0) {
          const ret = Reflect.set(target, i, value)

          const index = parseInt(i)
          if (!Number.isNaN(index)) {
            this.add(value, index)
          }

          return ret
        } else {
          return target[index]
        }
      }).bind(this)
    })
  }

  static union(a, b) {
    const result = new SLSet()

    const length = Math.max(a.length, b.length)
    for (let i = 0; i < length; i++) {
      if (i < a.length) result.push(a[i])
      if (i < b.length) result.push(b[i])
    }

    return result
  }

  union(b) {
    for (let i = 0; i < b.length; i++) {
      this.push(b[i])
    }

    return this
  }
}

module.exports = { Serializable, SLArray, SLSet }
