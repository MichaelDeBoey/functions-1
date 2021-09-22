/* eslint-disable no-underscore-dangle , promise/prefer-await-to-callbacks,  */
// @ts-check
const { request } = require('http')
const { request: sRequest } = require('https')
const { PassThrough } = require('stream')

class StreamingResponse extends PassThrough {
  statusCode = 200

  /** @type {Map<string | number | readonly string[]>} */
  _clientHeaders
  _metadataSent = false
  METADATA_BOUNDARY = `___x_nf-metadata_boundary-${Date.now()}`
  outgoingMessage

  constructor(url) {
    super()
    // eslint-disable-next-line node/no-unsupported-features/node-builtins
    const parsedUrl = new URL(url)
    this.outgoingMessage = parsedUrl.protocol === 'https:' ? sRequest(url) : request(url)
    this.outgoingMessage.setHeader('x-nf-metadata-boundary', this.METADATA_BOUNDARY)
    this.pipe(this.outgoingMessage)
  }

  setHeader(name, value) {
    if (!this._clientHeaders) {
      this._clientHeaders = new Map()
    }
    this._clientHeaders.set(name, value)
    return this
  }

  _getMetadata() {
    return `${JSON.stringify({
      // eslint-disable-next-line node/no-unsupported-features/es-builtins
      headers: Object.fromEntries(this._clientHeaders.entries()),
      statusCode: this.statusCode,
    })}\r\n${this.METADATA_BOUNDARY}`
  }

  write(data, encoding, callback) {
    if (!this._metadataSent) {
      super.write(this._getMetadata())
      this._metadataSent = true
    }
    return super.write(data, encoding, callback)
  }
}

/**
 *
 * @param {import("./streamer").StreamingHandler} handler
 * @returns {import("../function/handler").Handler}
 */
const wrapHandler =
  (handler) =>
  /**
   * @returns {import("../function/response").Response | Promise<import("../function/response").Response>}
   */
  (event, context, callback) => {
    // const { callbackUrl } = event.queryStringParameters
    const callbackUrl = 'https://ntl-functions-streaming.herokuapp.com/.stream/hello'

    /** @type {StreamingResponse} */
    let res

    try {
      res = new StreamingResponse(callbackUrl)
    } catch (error) {
      console.error(error)
      return {
        statusCode: 500,
        body: 'Internal Server Error',
      }
    }

    return new Promise((resolve) => {
      res.on('error', (error) => {
        console.error(error)
        resolve({
          statusCode: 500,
          body: 'Internal Server Error',
        })
      })

      res.on('finish', () =>
        resolve({
          statusCode: 200,
          body: 'OK',
        }),
      )
      /* eslint-disable promise/prefer-await-to-then, promise/always-return */

      const result = handler(event, res, context, callback)

      if (result) {
        result
          .then(() => {
            res.end()
            resolve({
              statusCode: 200,
              body: 'OK',
            })
          })
          .catch((error) => {
            console.error(error)
            resolve({
              statusCode: 500,
              body: 'Internal Server Error',
            })
          })
      } else {
        res.end()
        resolve({
          statusCode: 200,
          body: 'OK',
        })
      }
      /* eslint-enable  promise/prefer-await-to-then, promise/always-return */
    })
  }

module.exports.streamer = wrapHandler
/* eslint-enable no-underscore-dangle, promise/prefer-await-to-callbacks, */
