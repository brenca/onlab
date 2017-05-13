const Language = require('../lib/language')
const EventEmitter = require('events')
const { Lexer, Parser } = Language
const clone = require('clone')
const a = require('awaiting')

async function delay(ms) {
  if (ms > 0) {
    return a.delay(ms)
  } else {
    return new Promise(resolve => setImmediate(resolve))
  }
}

const acc = 'àèìòùÀÈÌÒÙáéíóúýÁÉÍÓÚÝâêîôûÂÊÎÔÛãñõÃÑÕäëïöüÿÄËÏÖÜŸçÇßØøÅåÆæœűŰőŐ'
const spec = '\\\\.,\\/#!$%@&<>\\^\\*;:{}=\\-\\+_`~()\'"'

class RuntimeError extends Error {
  constructor(message, position, node) {
    const _constructMessage = (message, position) => {
      if (position) {
        message += ' - at :' + (position.line + 1) + ':' + (position.char + 1)
      }
      return message
    }
    
    super(_constructMessage(message, position))
    this.name = 'RuntimeError'
    this.position = position
    this.node = node
  }
}

Array.prototype.toString = function () {
  return '[' + this.join(' ') + ']'
}
Array.prototype.equals = function (array) {
  if (!array) return false;
  if (this.length != array.length) return false;

  for (let i = 0, l = this.length; i < l; i++) {
    if (this[i] instanceof Array && array[i] instanceof Array) {
      if (!this[i].equals(array[i]))
        return false
    } else if (this[i] != array[i]) { 
      return false
    }
  }
  return true
}
Object.defineProperty(Array.prototype, "equals", {enumerable: false})

class LogoCore extends Language {
  constructor(handler) {
    super()
    this._handler = handler
    this._drawDelay = 0
    this._executionDelay = 0
    this._executing = false
    this._paused = false
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('comment', /\/\/.*(?=\r?\n|$)/iu),
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('bool', /(?:\b)(true|false)(?!\w)/iu),
      new Lexer.TokenClass('not', /(?:\b)not(?!\w)/iu),
      new Lexer.TokenClass('and', /(?:\b)and(?!\w)/iu),
      new Lexer.TokenClass('or', /(?:\b)or(?!\w)/iu),
      new Lexer.TokenClass('draw-cmd', /(?:\b)(fd|forward|bk|backward|rt|right|lt|left)(?!\w)/iu),
      new Lexer.TokenClass('objparam-cmd', /(?:\b)(firstput|lastput|item|member\?)(?!\w)/iu),
      new Lexer.TokenClass('strparam-cmd', /(?:\b)(make|local)(?!\w)/iu),
      new Lexer.TokenClass('general-cmd', /(?:\b)(list\?|number\?|word\?|output|thing|setpencolor|setpenwidth|setpen|setpc|towards)(?!\w)/iu),
      new Lexer.TokenClass('moreparam-cmd', /(?:\b)(print)(?!\w)/iu),
      new Lexer.TokenClass('twoormoreparam-cmd', /(?:\b)(list|word|sentence)(?!\w)/iu),
      new Lexer.TokenClass('list-cmd', /(?:\b)(first|last|butfirst|butlast|uppercase|lowercase|count|empty\?|run|setposition)(?!\w)/iu),
      new Lexer.TokenClass('math-cmd', /(?:\b)(abs|sin|cos|tan|arcsin|arccos|arctan|exp|integer|int|log10|log|random|round|sqrt|wait|setx|sety|setheading)(?!\w)/iu),
      new Lexer.TokenClass('twomath-cmd', /(?:\b)(power|pow)(?!\w)/iu),
      new Lexer.TokenClass('if-cmd', /(?:\b)if(?!\w)/iu),
      new Lexer.TokenClass('for-cmd', /(?:\b)(for|repeat)(?!\w)/iu),
      new Lexer.TokenClass('to-cmd', /(?:\b)to(?!\w)/iu),
      new Lexer.TokenClass('end', /(?:\b)end(?!\w)/iu),
      new Lexer.TokenClass('noparam-cmd', /(?:\b)(pi|date|time|stop|heading|hideturtle|showturtle|shown\?|position|xpos|ypos|home|clean|clearscreen|cs|pendown|pd|penup|pu|penwidth|pencolor|pc|pen|e)(?!\w)/iu),
      new Lexer.TokenClass('word', new RegExp('"[a-z' + acc + spec + '0-9]*', 'iu')),
      new Lexer.TokenClass('var', new RegExp(':[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('literal', new RegExp('[a-z' + acc + '0-9]+', 'iu')),
      new Lexer.TokenClass('char', /\S/iu)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <SubProgram> ::= "[" <Program> "]"
      <OptionalSubProgram> ::= <SubProgram> | ""
      <List> ::= "[" <ListInner> "]"
      <Expression> ::= <Token-var> | <ListCommand> | <GeneralCommand> | <ObjectParamCommand> | <StringParamCommand> | <MathCommand> | <TwoMathCommand> | <NoparamCommand> | <DrawCommand> | <For> | <If> | <To> | <MoreParamCommand> | <Group> | <UserDefined> | <Token-comment>
      <Parameter> ::= <Bool> | <ListOrString>
      <GeneralCommand> ::= <Token-general-cmd> <Parameter>
      <ListCommand> ::= <Token-list-cmd> <Parameter>
      <StringParamCommand> ::= <Token-strparam-cmd> <String> <Parameter>
      <ObjectParamCommand> ::= <Token-objparam-cmd> <Parameter> <Parameter>
      <MathCommand> ::= <Token-math-cmd> <Math>
      <TwoMathCommand> ::= <Token-twomath-cmd> <Math> <Math>
      <NoparamCommand> ::= <Token-noparam-cmd>
      <ListOrString> ::= <String> | <List>
      <String> ::= <Token-word>
      <DrawCommand> ::= <Token-draw-cmd> <Math>
      <For> ::= <Token-for-cmd> <Math> <SubProgram>
      <If> ::= <Token-if-cmd> <Bool> <SubProgram> <OptionalSubProgram>
      <To> ::= <Token-to-cmd> <Token-literal> <Variables> <Program> <Token-end>
      <Variables> ::= <Variables> <Token-var> | ""
      <ListInner> ::= <ListInner> <Parameter> | ""
      <MoreParamCommand> ::= <Token-moreparam-cmd> <Parameter> | <Token-twoormoreparam-cmd> <Parameter> <Parameter>
      <UserDefined> ::= <Token-literal> <Parameters>
      <Parameters> ::= <Parameters> <Parameter> | "" | <Token-EOF>
      
      <Group> ::= "(" <more-cmd> <Parameters> ")"
      <more-cmd> ::= <Token-twoormoreparam-cmd> | <Token-moreparam-cmd> | ""
      
      // Math expressions
      <Math> ::= <MathTerm> "+" <Math> | <MathTerm> "-" <Math> | <MathTerm>
      <MathTerm> ::= <MaybeSignedMathFactor> "*" <MathTerm> | <MaybeSignedMathFactor> "/" <MathTerm> | <MaybeSignedMathFactor> "%" <MathTerm> | <MaybeSignedMathFactor>
      <MaybeSignedMathFactor> ::= "+" <MathLiteral> | "-" <MathLiteral> | <MathLiteral>
      <MathLiteral> ::= <Expression> | <Token-int> | <Token-float>
      
      // Boolean expressions
      <Bool> ::= <BoolAND> <Token-or> <Bool> | <BoolAND>
      <BoolAND> ::= <BoolEQ> <Token-and> <BoolAND> | <BoolEQ>
      <BoolEQ> ::= <BoolCOMP> "==" <BoolEQ> | <BoolCOMP> "!=" <BoolEQ> | <BoolCOMP>
      <BoolCOMP> ::= <BoolNOT> "<" <BoolCOMP> | <BoolNOT> ">" <BoolCOMP> | <BoolNOT> "<=" <BoolCOMP> | <BoolNOT> ">=" <BoolCOMP> | <BoolNOT>
      <BoolNOT> ::= <Token-not> <BoolLiteral> | <BoolLiteral>
      <BoolLiteral> ::= <Math> | <Token-bool>
      `
    )
    
    this._actions = {
      'UserDefined': async (node, parent) => {
        let name = await this.executeOne(node.children[0])
        let result = undefined
        
        let flattenParameters = (node) => {
          let list = []
          
          for (let child of node.children) {
            if (child.rule.name !== 'Parameters' 
             && child.rule.name !== 'Token-EOF') {
              list.push(child)
            } else {
              list = list.concat(flattenParameters(child))
            }
          }
          
          return list
        }
        
        let parameters = []
        if (node.children[1] && node.children[1].rule.name === 'Parameters') {
          parameters = flattenParameters(node.children[1])
        }
        
        const procedure = this._getProcedure(node, name)
        if (procedure) {
          let body = clone(procedure.body)
          body.parent = procedure.body.parent
          
          for (let i = 0; i < procedure.parameters.length; i++) {
            body.variables[procedure.parameters[i]] = 
              await this.executeOne(parameters[i])
          }
          for (let i = 0; i < body.children.length; i++) {
            body.children[i].parent = body
          }
          
          result = await this.executeOne(body)
        } else {
          result = {
            value: name
          }
        }
        
        return result && result.value ? result.value : undefined
      },
      'For': async (node) => {
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            let val = await this.executeOne(child)
            if (val instanceof Object && val.constructor !== Array) return val
            parameters.push(val)
          } else {
            parameters.push(child)
          }
        }
        
        if (parameters.length === 3) {
          for (let i = 0; i < parameters[1]; i++) {
            let body = parameters[2]
            this._pushToCallStack(node, parameters[0].toLowerCase(), i)
            let val = await this.executeOne(body)
            if (val instanceof Object && val.constructor !== Array) return val
          }
        }
      },
      'If': async (node) => {
        let parameters = []
        for (let child of node.children) {
          if (child.rule.name !== 'SubProgram') {
            let val = await this.executeOne(child)
            if (val instanceof Object && val.constructor !== Array) return val
            parameters.push(val)
          } else {
            parameters.push(child)
          }
        }
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), parameters[1])
        if (parameters.length === 4) {
          let val = parameters[1] ? await this.executeOne(parameters[2])
            : await this.executeOne(parameters[3])
          if (val instanceof Object && val.constructor !== Array) return val
        } else if (parameters.length === 3) {
          let val = parameters[1] ? await this.executeOne(parameters[2])
            : undefined
          if (val instanceof Object && val.constructor !== Array) return val
        }
      },
      'Group': async (node) => {
        if (node.children[0].rule.value === '(' && 
          node.children[node.children.length - 1].rule.value === ')')
          node.children = node.children.slice(1,-1)
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        if (parameters.length > 1) {
          let ret = await this._actions['MoreParamCommand'](node)
          if (ret) {
            return ret[0]
          } else  {
            return Promise.reject(
              new RuntimeError(
                'Too many group elements', 
                node.position,
                node
              )
            )
          }
        }
        if (parameters[0])
          return parameters[0].length === 1 ? parameters[0][0] : parameters[0]
      },
      'Variables': async (node) => {
        let list = []
        
        for (let child of node.children) {
          if (child.rule.name !== 'Variables') {
            list.push(child.rule.value.slice(1))
          } else {
            list = list.concat(await this.executeOne(child))
          }
        }
        
        return list
      },
      'MoreParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let actions = {
          'print': (params) => {
            this._handler.print(params.join(' '))
            return params.join(' ')
          },
          'list': (params) => {
            return params
          },
          'word': (params) => {
            let out = ''
            for (let i = 0; i < params.length; i++) {
              if (typeof params[i] !== 'string') {
                return Promise.reject(
                  new RuntimeError(
                    'Parameter is not a word',
                    node.position,
                    node
                  )
                )
              }
              out += params[i]
            }
            return out
          },
          'sentence': (params) => {
            return [].concat.apply([], params)
          }
        }
        
        if (!actions[parameters[0].toLowerCase()]) return
        
        if (parameters.length === 3) {
          this._pushToCallStack(node, parameters[0].toLowerCase(), 
            [parameters[1], parameters[2]])
          return actions[parameters[0].toLowerCase()](
            [parameters[1], parameters[2]])
        } else {
          this._pushToCallStack(node, parameters[0].toLowerCase(), [parameters[1]])
          return actions[parameters[0].toLowerCase()]([parameters[1]])
        }
      },
      'Parameters': async (node) => {
        let list = []
        
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          if (child.rule.name !== 'Parameters') {
            list.push(val)
          } else {
            list = list.concat(val)
          }
        }
        
        return list
      },
      'Program': async (node) => {
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) {
            if (node.parent === undefined) {
              return val.value
            } else {
              return val
            }
          }
        }
      },
      'SubProgram': async (node) => {
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
        }
      },
      'GeneralCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let actions = {
          'list?': async (x) => {
            return x.constructor === Array
          },
          'number?': async (x) => {
            return typeof x == 'number'
          },
          'word?': async (x) => {
            return typeof x == 'string'
          },
          'output': async (x) => {
            return {
              return: true,
              value: x
            }
          },
          'thing': async (x) => {
            return this._getValue(node, x)
          },
          'setpen': async (x) => {
            this._handler.drawing = x[0]
            this._handler.color = x[1]
          },
          'setpc': async (x) => {
            this._handler.color = x
          },
          'setpenwidth': async (x) => {
            this._handler.width = x
          },
          'towards': async (x) => {
            return Math.atan2(
              x[0] - this._handler.x, 
              x[1] - this._handler.y
            ) / (2.0 * Math.PI) * 360.0
          }
        }
        actions['setpencolor'] = actions['setpc']
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), parameters[1])
        return await actions[parameters[0].toLowerCase()](parameters[1])
      },
      'NoparamCommand': (node) => {        
        let actions = {
          'pi': () => {
            return Math.PI
          },
          'e': () => {
            return Math.E
          },
          'date': () => {
            return new Date().toISOString().slice(0, 10)
          },
          'time': () => {
            let date = new Date()
            return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}:${date.getMilliseconds()}`
          },
          'stop': () => {
            return {
              return: true,
              value: null
            }
          },
          'heading': () => {
            return this._handler.heading
          },
          'hideturtle': () => {
            this._handler.shown = false
          },
          'showturtle': () => {
            this._handler.shown = true
          },
          'shown?': () => {
            return this._handler.shown
          },
          'position': () => {
            return [this._handler.x, this._handler.y]
          },
          'xpos': () => {
            return this._handler.x
          },
          'ypos': () => {
            return this._handler.y
          },
          'home': () => {
            this._handler.resetTurtle()
          },
          'clean': () => {
            this._handler.eraseCanvas()
          },
          'clearscreen': () => {
            this._handler.resetTurtle()
            this._handler.eraseCanvas()
          },
          'pendown': () => {
            this._handler.drawing = true
          },
          'penup': () => {
            this._handler.drawing = false
          },
          'penwidth': () => {
            return this._handler.width
          },
          'pencolor': () => {
            return this._handler.color
          },
          'pen': () => {
            return [this._handler.drawing, this._handler.color]
          }
        }
        actions['cs'] = actions['clearscreen']
        actions['pd'] = actions['pendown']
        actions['pu'] = actions['penup']
        actions['pc'] = actions['pencolor']
        
        this._pushToCallStack(node, node.rule.value.toLowerCase())
        return actions[node.rule.value.toLowerCase()]()
      },
      'MathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let mathActions = {
          'abs': async (m) => {
            return Math.abs(m)
          },
          'sin': async (m) => {
            return Math.sin(m)
          },
          'cos': async (m) => {
            return Math.cos(m)
          },
          'tan': async (m) => {
            return Math.tan(m)
          },
          'arcsin': async (m) => {
            return Math.asin(m)
          },
          'arccos': async (m) => {
            return Math.acos(m)
          },
          'arctan': async (m) => {
            return Math.atan(m)
          },
          'exp': async (m) => {
            return Math.exp(m)
          },
          'int': async (m) => {
            return Math.floor(m)
          },
          'log10': async (m) => {
            return Math.log10(m)
          },
          'log': async (m) => {
            return Math.log(m)
          },
          'random': async (m) => {
            return Math.floor(Math.random() * (Math.floor(m) + 1))
          },
          'round': async (m) => {
            return Math.round(m)
          },
          'sqrt': async (m) => {
            return Math.sqrt(m)
          },
          'wait': async (m) => {
            await delay(m)
          },
          'setx': async (m) => {
            this._handler.x = m
          },
          'sety': async (m) => {
            this._handler.y = m
          },
          'setheading': async (m) => {
            this._handler.heading = m
          }
        }
        mathActions['integer'] = mathActions['int']
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), parameters[1])
        return await mathActions[parameters[0].toLowerCase()](parameters[1])
      },
      'TwoMathCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let mathActions = {
          'pow': (a, b) => {
            return Math.pow(a, b)
          }
        }
        mathActions['power'] = mathActions['pow']
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return mathActions[parameters[0].toLowerCase()](
          parameters[1], parameters[2])
      },
      'ObjectParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let objectParamActions = {
          'firstput': (o, l) => {
            return [o].concat(l)
          },
          'lastput': (o, l) => {
            return l.concat([o])
          },
          'item': (o, l) => {
            return l[o - 1]
          },
          'member?': (o, l) => {
            return !!l.find(x => {
              if (x.equals)
                return x.equals(o)
              return x === o
            })
          }
        }
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return objectParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'StringParamCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let stringParamActions = {
          'make': (s, v) => {
            this._setValue(node, s, v)
          },
          'local': (s, v) => {
            let program = node
            while (program) {
              if (program.rule.name === 'Program') {
                program.variables[s] = v
                return
              }
              program = program.parent
            }
          }
        }
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), 
          [parameters[1], parameters[2]])
        return stringParamActions[parameters[0].toLowerCase()](
          parameters[1],parameters[2])
      },
      'ListCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let listActions = {
          'first': async (l) => {
            return l[0]
          },
          'butfirst': async (l) => {
            return l.slice(1, l.length)
          },
          'last': async (l) => {
            return l[l.length - 1]
          },
          'butlast': async (l) => {
            return l.slice(0, -1)
          },
          'lowercase': async (l) => {
            if (typeof l === 'string' || l instanceof String) {
              return l.toLowerCase()
            } else {
              return l.map(item => {
                if (typeof item === 'string' || item instanceof String) {
                  return item.toLowerCase()
                } else {
                  return item
                }
              })
            }
          },
          'uppercase': async (l) => {
            if (typeof l === 'string' || l instanceof String) {
              return l.toUpperCase()
            } else {
              return l.map(item => {
                if (typeof item === 'string' || item instanceof String) {
                  return item.toUpperCase()
                } else {
                  return item
                }
              })
            }
          },
          'count': async (l) => {
            return l.length
          },
          'empty?': async (l) => {
            return l.length === 0
          },
          'run': async (l) => {
            let str = l.join(' ')
            let result = await this.execute(str, true, true)
            return result
          },
          'setposition': async (l) => {
            this._handler.x = l[0]
            this._handler.y = l[1]
          }
        }
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), parameters[1])
        return await listActions[parameters[0].toLowerCase()](parameters[1])
      },
      'List': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] ? parameters[0] : []
      },
      'ListInner': async(node) => {
        let list = []
        
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          if (child.rule.name !== 'ListInner') {
            list.push(val)
          } else {
            list = list.concat(val)
          }
        }
        
        return list
      },
      'Math': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let mathActions = {
          '+': (a, b) => {
            return a + b
          },
          '-': (a, b) => {
            return a - b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'MathFactor': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'MathGroup': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'MathTerm': async (node) => {        
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let mathActions = {
          '/': (a, b) => {
            return a / b
          },
          '*': (a, b) => {
            return a * b
          },
          '%': (a, b) => {
            return a % b
          }
        }
        
        return mathActions[parameters[1]](parameters[0], parameters[2])
      },
      'MaybeSignedMathFactor': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        if (parameters.length === 1) {
          return parameters[0]
        } else {
          if (parameters[0] === '-') {
            return -parameters[1]
          } else {
            return parameters[1]
          }
        }
      },
      'Bool': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] || parameters[2]
      },
      'BoolAND': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0] && parameters[2]
      },
      'BoolNOT': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return !parameters[1]
      },
      'BoolCOMP': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let boolActions = {
          '<': (a, b) => {
            return a < b
          },
          '>': (a, b) => {
            return a > b
          }
        }
        
        return boolActions[parameters[1]](parameters[0], parameters[2])
      },
      'BoolEQ': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let boolActions = {
          '==': (a, b) => {
            return a == b
          },
          '!=': (a, b) => {
            return a != b
          }
        }
        
        return boolActions[parameters[1]](parameters[0], parameters[2])
      },
      'BoolFactor': async (node) => {
        let parameters = []
        for (let child of node.reducedChildren()) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        return parameters[0]
      },
      'DrawCommand': async (node) => {
        let parameters = []
        for (let child of node.children) {
          let val = await this.executeOne(child)
          if (val instanceof Object && val.constructor !== Array) return val
          parameters.push(val)
        }
        
        let drawActions = {
          'fd': async (x) => {
            await delay(this._drawDelay)
            this._handler.move(x)
          },
          'bk': async (x) => {
            await delay(this._drawDelay)
            this._handler.move(-x)
          },
          'lt': async (x) => {
            this._handler.turn(-x)
          },
          'rt': async (x) => {
            this._handler.turn(x)
          }
        }
        drawActions['forward'] = drawActions['fd']
        drawActions['backward'] = drawActions['bk']
        drawActions['right'] = drawActions['rt']
        drawActions['left'] = drawActions['lt']
        
        this._pushToCallStack(node, parameters[0].toLowerCase(), parameters[1])
        await drawActions[parameters[0].toLowerCase()](parameters[1])
      }
    }
    
    this._parses = {
      'int': async (node) => {
        return parseInt(node.rule.value)
      },
      'float': async (node) => {
        return parseFloat(node.rule.value)
      },
      'word': async (node) => {
        return node.rule.value.slice(1)
      },
      'literal': async (node) => {
        return node.rule.value
      },
      'bool': async (node) => {
        if (node.rule.value === 'true')
          return true
        return false
      },
      'noparam-cmd': async (node) => {
        return await this._actions['NoparamCommand'](node)
      },
      'var': async (node) => {
        return this._getValue(node, node.rule.value.slice(1))
      }
    }
  }
  
  _getProcedure(node, name) {
    let program = node
    while (program) {
      if (program.rule.name === 'Program' && 
          program.procedures[name] !== undefined && 
          program.procedures[name].position < node.position.absolute)
        break
      program = program.parent
    }
    
    return program ? program.procedures[name] : undefined
  }
  
  _getCode(node) {
    let program = node
    while (program.rule.name !== 'Program') program = program.parent
    return program.code
  }
  
  _getValue(node, name) {
    let program = node
    while (program) {
      if (program.rule.name === 'Program' && 
          program.variables[name] !== undefined) {
        return program.variables[name]
      }
      program = program.parent
    }
    
    return Promise.reject(new RuntimeError(
      'Undefined variable "' + name + '"',
      node.position,
      node
    ))
  }
  
  _setValue(node, name, val) {
    let program = node
    while (program) {
      if (program.rule.name === 'Program' && 
          program.variables[name] !== undefined) {
        program.variables[name] = val
        return
      }
      program = program.parent
    }
    
    program = node
    while (program) {
      if (program.rule.name === 'Program') {
        program.variables[name] = val
        return
      }
      program = program.parent
    }
  }
  
  _pushToCallStack(node, name, parameters) {
    let program = node
    while (program.rule.name !== 'Program') program = program.parent
    program.callStack.push({ name, parameters })
  }
  
  getCallStack(node) {
    let program = node
    while (program.rule.name !== 'Program') program = program.parent
    return program.callStack
  }
  
  async executeOne(node, parent) {
    if (this._handler.exec) this._handler.exec(node.position)
    await delay(this._executionDelay)
    if (this._paused) await this._paused
    if (!this._executing) {
      return {
        return: true,
        value: null
      }
    }

    if (this._actions[node.rule.name]) {
      return await this._actions[node.rule.name](node, parent)
    } else if (node.rule.class) {
      if (this._parses[node.rule.class.name]) {
        return await this._parses[node.rule.class.name](node)
      } else {
        return node.rule.value
      }
    } else {
      return Promise.reject(new RuntimeError(
        'Unimplemented procedure "' + node.rule.name + '"',
        node.position,
        node
      ))
    }
  }
  
  async isLiteral(node) {
    if (node.rule.name === 'UserDefined') {
      let name = await this.executeOne(node.children[0])
      const procedure = this._getProcedure(node, name)
      if (procedure) {
        return false
      } else {
        return true
      }
    } else if (this._actions[node.rule.name] || 
        node.rule.class.name === 'noparam-cmd' ||
        node.rule.class.name === 'comment') {
      return false
    }
    
    return true
  }
  
  async execute(code, noreset = false, noexecuteflag = false) {
    if (this._executing && !noreset) {
      return new RuntimeError('Execution in progress')
    } else {
      if (!noexecuteflag) this._executing = true
      
      let restoreParent = (node) => {
        for (let i = 0; i < node.children.length; i++) {
          node.children[i].parent = node
          restoreParent(node.children[i])
        }
      }
      
      let root
      try {
        root = this.buildAST(code)[0]
      } catch (e) {
        if (!noexecuteflag) this._executing = false
        throw e
      }
      restoreParent(root)
      
      let flatten = (node, type) => {
        let list = []
        
        for (let child of node.children) {
          if (child.rule.name !== type) {
            list.push(child)
          } else {
            list = list.concat(flatten(child, type))
          }
        }
        
        return list
      }
      
      let id = 1
      let mergePrograms = (node) => {
        if (node.rule.name === 'Program') {
          node.id = id++
          node.variables = {}
          node.procedures = {}
          node.callStack = []
          
          for (let i = 0; i < node.children.length; i++) {
            let programChild = node.children[i]
            if (programChild.rule.name === 'Program') {
              let merged = flatten(programChild, 'Program')
              for (let j = 0; j < merged.length; j++) merged[j].parent = node
              Array.prototype.splice.apply(
                node.children, [i, 1].concat(merged)
              )
            }
          }
          
          const begin = node.children[0].position.absolute
          let last = node.children[node.children.length - 1]
          while (last.children && last.children.length > 0) 
            last = last.children[last.children.length - 1]
          const end = last.position.absolute + 
            (last.rule.value ? last.rule.value.length : 0)
          node.code = code.slice(begin, end)
        }
        for (let i = 0; i < node.children.length; i++) {
          mergePrograms(node.children[i])
        }
      }
      
      let assignUserDefinedToPrograms = async (node) => {
        if (node.rule.name === 'To') {
          let program = node
          let position = node.children[0].position.absolute
          while (program.rule.name !== 'Program') program = program.parent
          
          node.children = node.children.slice(1, -1)
          let parameters = []
          for (let child of node.children) {
            if (child.rule.name !== 'Program')
              child = await this.executeOne(child)
            parameters.push(child)
          }
          
          program.procedures[parameters[0]] = {
            name: parameters[0],
            parameters: (parameters.length === 3) ? parameters[1] : [],
            body: (parameters.length === 3) ? parameters[2] : parameters[1],
            position
          }
        }
        for (let i = 0; i < node.children.length; i++) {
          await assignUserDefinedToPrograms(node.children[i])
        }
      }
      
      let resolveUserDefinedCalls = async (node) => {
        let flattenParameters = async (node) => {
          let list = []
          
          for (let i = 0; i < node.children.length; i++) {
            let child = node.children[i]
            if (child.rule.name !== 'Parameters' 
             && child.rule.name !== 'Token-EOF'
             && child.rule.name !== 'UserDefined') {
              list.push(child)
            } else if (child.rule.name === 'UserDefined') {
              await resolveUserDefinedCalls(child)
              node.children[i].parent = node
              list.push(node.children[i])
            } else {
              let flat = await flattenParameters(child)
              for (let i = 0; i < flat.length; i++) {
                flat[i].parent = node
              }
              list = list.concat(flat)
            }
          }
          
          return list
        }
        
        let repackParameters = (node, parameters) => {
          node.children = parameters
          for (let i = 0; i < node.children.length; i++) {
            node.children[i].parent = node
          }
          return node
        }
        
        if (node.rule.name === 'UserDefined') {
          const name = await this.executeOne(node.children[0])
          let program = node
          while (program) {
            if (program.rule.name === 'Program' && program.procedures[name] && 
                program.procedures[name].position < node.position.absolute)
              break
            program = program.parent
          }
          
          let original = node.children[1]
          if (original !== undefined) {
            let parameters = await flattenParameters(original)
            let index = node.parent.children.indexOf(node)
            
            if (program) {
              const procedure = program.procedures[name]
              const paramlength = procedure ? procedure.parameters.length : 0
              
              let toRepack = parameters.splice(0, paramlength)
              node.children[1] = repackParameters(original, toRepack)
            } else {
              let child = node.children[0]
              child.parent = node.parent
              node.parent.children[index] = child
            }
            
            let parent = node.parent
            while (parent.parent && !parent.rule.subrules.some(rule => {
              return rule[0].name === parent.rule.name
            })) {
              index = parent.parent.children.indexOf(parent)
              parent = parent.parent
            }
            
            for (let x = 0; x < parameters.length; x++) {
              parameters[x].parent = parent
            }
            
            Array.prototype.splice.apply(
              parent.children, [index + 1, 0].concat(parameters)
            )
          }
        }
        for (let i = 0; i < node.children.length; i++) {
          await resolveUserDefinedCalls(node.children[i])
        }
      }
      
      let removeUserDefinedFromPrograms = (node) => {
        for (let i = 0; i < node.children.length; i++) {
          removeUserDefinedFromPrograms(node.children[i])
        }
        node.children = node.children.filter(child => child.rule.name !== 'To')
      }
      
      let checkProgramChildren = async (node) => {
        for (let i = 0; i < node.children.length; i++) {
          if (node.rule.name && node.rule.name === 'Program' && 
              await this.isLiteral(node.children[i])) {
            let val = await this.executeOne(node.children[i])
            throw new Parser.SyntaxError('Unexpected token "' + val + '"',
              node.children[i].position
            )
          }
          
          checkProgramChildren(node.children[i])
        }
      }
      
      let pp = (node, level = 0) => { // for debugging purpouses
        let ident = Array(level * 2 + 1).join(' ')
        console.log(ident, node.rule.name || (node.rule.value + '(' + node.rule.class.name + ')'), node.id || ' ');
        if (node.children) {
          for (var i = 0; i < node.children.length; i++) {
            pp(node.children[i], level + 1)
          }
        }
      }
      
      try {
        mergePrograms(root)
        await assignUserDefinedToPrograms(root)
        await resolveUserDefinedCalls(root)
        removeUserDefinedFromPrograms(root)
        await checkProgramChildren(root)
      } catch (e) {
        if (!noexecuteflag) this._executing = false
        throw e
      }

      let ret
      try {
        ret = await this.executeOne(root)
      } catch (e) {
        if (this._executing) {
          if (!noexecuteflag) this._executing = false
          throw e
        } else {
          return {
            return: true,
            value: null
          }
        }
      } 
      if (!noexecuteflag) this._executing = false
      return ret
    }
  }
  
  async terminate() {
    this._executing = false
  }
}

let __LogoInstance = null

class Logo extends EventEmitter {
  constructor() {
    super()
    if (!__LogoInstance) {
      __LogoInstance = this
      
      this._logo = new LogoCore(this)
      
      this.state = {
        heading: 0,
        home: {
          x: 0,
          y: 0
        },
        position: {
          x: 0,
          y: 0
        },
        color: [0, 0, 0],
        width: 1,
        isDrawing: true,
        isTurtleShown: true
      }
    }
    
    return __LogoInstance
  }
  
  exec(position) {
    this.emit('executing', position)
  }
  
  setHome(home) {
    this.state.home = clone(home)
    this.state.position = clone(home)
  }
  
  move(x) {
    let from = clone(this.state.position)
    this.state.position.x += 
      Math.cos(this.state.heading / 360.0 * 2.0 * Math.PI) * x
    this.state.position.y += 
      Math.sin(this.state.heading / 360.0 * 2.0 * Math.PI) * x
    
    this.emit('move', from, this.state.position)
  }
  
  turn(x) {
    this.state.heading += x
    while (this.state.heading > 360) this.state.heading -= 360
    while (this.state.heading < 0)   this.state.heading += 360
    
    this.emit('turn', this.state.heading)
  }
  
  eraseCanvas() {
    this.emit('erase')
  }
  
  resetTurtle() {
    let from = clone(this.state.position)
    this.state.position = clone(this.state.home)
    this.state.heading = 0
    
    this.emit('move', from, this.state.position)
    this.emit('turn', this.state.heading)
  }
  
  print(what) {
    this.emit('print', what)
  }
  
  get heading() {
    return this.state.heading
  }
  set heading(x) {
    this.state.heading = x
    return this.state.heading
  }
  
  get shown() {
    return this.state.isTurtleShown
  }
  set shown(x) {
    this.state.isTurtleShown = x
    return this.state.isTurtleShown
  }
  
  get drawing() {
    return this.state.isDrawing
  }
  set drawing(x) {
    this.state.isDrawing = x
    return this.state.isDrawing
  }
  
  get color() {
    return this.state.color
  }
  set color(x) {
    this.state.color = x
    return this.state.color
  }
  
  get width() {
    return this.state.width
  }
  set width(x) {
    this.state.width = x
    return this.state.width
  }
  
  get x() {
    return this.state.position.x
  }
  set x(x) {
    this.state.position.x = x
    return this.state.position.x
  }
  
  get y() {
    return this.state.position.y
  }
  set y(x) {
    this.state.position.y = x
    return this.state.position.y
  }
  
  get delay() {
    return this._logo._executionDelay
  }
  set delay(x) {
    this._logo._executionDelay = x
    return this._logo._executionDelay
  }
  
  get executing() {
    return this._logo._executing
  }
  
  getCallStack(node) {
    return this._logo.getCallStack(node)
  }
  
  async execute(code, noreset = false, noexecuteflag = false) {
    if (this._logo._executing) return
    try {
      this.emit('execution-started')
      let val = await this._logo.execute(code, noreset, noexecuteflag)
      this.emit('execution-stopped')
      return val
    } catch (e) {
      this.emit('execution-stopped', e)
      throw e
    } 
  }
  
  pause() {
    this._logo._paused = a.event(this, 'execution-resumed')
    this.emit('execution-paused')
  }
  
  resume() {
    this.emit('execution-resumed')
  }
  
  terminate() {
    this._logo.terminate()
    this.emit('execution-stopped')
  }
}

module.exports = Logo