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

    if (sid !== undefined) {
      this.SID = sid
    }
  }

  get SID() {
    if (!this._SID) {
      this._SID = uuid()
    }

    return this._SID
  }

  set SID(sid) {
    this._SID = sid
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

class SerializableLookupMap extends Serializable {
  constructor(addedHook, deletedHook) {
    super()
    this._addedHook = addedHook
    this._deletedHook = deletedHook
    this.map = { }
  }

  set(index, value) {
    if (!this.map[index]) {
      this.map[index] = [value]
    } else {
      this.map[index].push(value)
    }

    this._addedHook(index, value)
  }

  delete(index, value) {
    if (this.map[index]) {
      this.map[index] = fast.filter(this.map[index], x => x !== value)
      if (this.map[index].length === 0) {
        this.map[index] = undefined
      }
    }

    this._deletedHook(index, value)
  }

  adjust(index) {
    this.forEach(key => {
      if (this.map[key] !== undefined) {
        this.map[key] = fast.map(this.map[key], value => {
          if (value >= index) {
            return value - 1
          } else {
            return value
          }
        })
      }
    })
  }

  get(index) {
    return this.map[index]
  }

  forEach(func) {
    fast.forEach(Object.keys(this.map), key => func(key, this.map[key]))
  }
}
Serializable.registerSubclass(SerializableLookupMap)

class SLArray extends Serializable {
  constructor(items) {
    super()

    this.PARENT = null
    this.lookupMap = new SerializableLookupMap((index, value) => {
      if (this.parent) {
        this.parent.addedTo(this, this.get(value))
      }
    }, (index, value) => {
      if (this.parent) {
        this.parent.removedFrom(this, this.get(value))
      }
    })
    this.subarrayMap = { }

    this._store = []
    if (items instanceof Array) {
      fast.forEach(items, (v, i) => this.add(v, i))
    } else if (items !== undefined) {
      this.add(items, 0)
    }
  }

  reset(array) {
    fast.forEach(
      this._store.slice(),
      (value, index) => this.remove(value, index)
    )

    if (array !== undefined) {
      if (array instanceof SLArray) {
        array.forEach((value, index) => this.add(value, index))
      } else {
        fast.forEach(array, (value, index) => this.add(value, index))
      }
    }
  }

  add(value, index, justMap = false) {
    if (!justMap) {
      this._store[index] = value
    }

    if (value instanceof SLArray) {
      this.subarrayMap[value.SID] = index
      value.parent = this
    } else if (value.SID !== undefined) {
      this.lookupMap.set(value.SID, index)
    }
  }

  remove(value, index, justMap = false) {
    if (value instanceof SLArray) {
      this.subarrayMap[value.SID] = undefined
    } else if (value.SID !== undefined) {
      this.lookupMap.delete(value.SID, index)
    }

    if (!justMap) {
      this._store.splice(index, 1)
      this.lookupMap.adjust(index)
    }
  }

  get parent() {
    return this.PARENT
  }

  set parent(parent) {
    this.lookupMap.forEach((key, value) => {
      parent.addedTo(this, this.get(value[0]))
    })
    this.PARENT = parent
  }

  addedTo(subarray, what) {
    this.add(what, this.subarrayMap[subarray.SID], true)
  }

  removedFrom(subarray, what) {
    this.remove(what, this.subarrayMap[subarray.SID], true)
  }

  get length() {
    return this._store.length
  }

  push(value) {
    this.add(value, this.length)
  }

  forEach(func) {
    return fast.forEach(this._store, func)
  }

  findIndex(func) {
    return fast.findIndex(this._store, func)
  }

  find(func) {
    return fast.find(this._store, func)
  }

  filter(func) {
    return fast.filter(this._store, func)
  }

  map(func) {
    return fast.map(this._store, func)
  }

  reduce(func, acc) {
    return fast.reduce(this._store, func, acc)
  }

  some(func) {
    return fast.some(this._store, func)
  }

  get(index) {
    return this._store[index]
  }

  set(value, index) {
    this.add(value, index)
  }

  indexOfItem(value) {
    const indexes = this.lookupMap.get(value.SID)
    if (indexes !== undefined) {
      return indexes[0]
    } else {
      return -1
    }
  }
}
Serializable.registerSubclass(SLArray)

class SLSet extends SLArray {
  constructor(items) {
    super(items)
  }

  add(value, index) {
    if (this.indexOfItem(value) < 0) {
      super.add(value, index)
    }
  }

  static union(a, b) {
    const result = new SLSet()

    const length = Math.max(a.length, b.length)
    for (let i = 0; i < length; i++) {
      if (i < a.length) result.push(a.get(i))
      if (i < b.length) result.push(b.get(i))
    }

    return result
  }

  union(b) {
    for (let i = 0; i < b.length; i++) {
      this.push(b.get(i))
    }

    return this
  }
}
Serializable.registerSubclass(SLSet)

module.exports = { Serializable, SLArray, SLSet }
