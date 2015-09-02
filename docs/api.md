<a name="MultiRedisClient"></a>
## MultiRedisClient ⇐ <code>EventEmitter</code>
**Kind**: global class  
**Extends:** <code>EventEmitter</code>  
**Access:** public  
**Author:** Sagie Gur-Ari  

* [MultiRedisClient](#MultiRedisClient) ⇐ <code>EventEmitter</code>
  * [new MultiRedisClient(params)](#new_MultiRedisClient_new)
  * [.setupPrototype()](#MultiRedisClient.setupPrototype) ℗
  * _static_
    * [.createClient(clients)](#MultiRedisClient.createClient) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
    * [.createClient(connectionInfo, [options])](#MultiRedisClient.createClient) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>

<a name="new_MultiRedisClient_new"></a>
### new MultiRedisClient(params)
Proxies requests to one or more redis clients.


| Param | Type | Description |
| --- | --- | --- |
| params | <code>object</code> | The client init params |
| [params.clients] | <code>redis</code> &#124; <code>Array</code> | The redis client/s (if not provided, the connection info must be provided instead) |
| [params.connectionInfo] | <code>Array</code> | The redis client/s connection info (if not provided, the redis clients must be provided) |
| [params.connectionInfo.host] | <code>string</code> | The redis host |
| [params.connectionInfo.post] | <code>number</code> | The redis port |
| [params.options] | <code>Array</code> | Used when this client creates the redis clients |

<a name="MultiRedisClient.setupPrototype"></a>
### MultiRedisClient.setupPrototype() ℗
Adds all functions with proxy capabilities.

**Access:** private  
<a name="MultiRedisClient.createClient"></a>
### MultiRedisClient.createClient(clients) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
Creates and returns a new MultiRedisClient instance.

**Kind**: static method of <code>[MultiRedisClient](#MultiRedisClient)</code>  
**Returns**: <code>[MultiRedisClient](#MultiRedisClient)</code> - The multiple redis client instance  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| clients | <code>redis</code> &#124; <code>Array</code> | The redis client/s |

<a name="MultiRedisClient.createClient"></a>
### MultiRedisClient.createClient(connectionInfo, [options]) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
**Kind**: static method of <code>[MultiRedisClient](#MultiRedisClient)</code>  
**Returns**: <code>[MultiRedisClient](#MultiRedisClient)</code> - The multiple redis client instance  
**Access:** public  

| Param | Type | Description |
| --- | --- | --- |
| connectionInfo | <code>Array</code> | The redis client/s connection info |
| connectionInfo.host | <code>string</code> | The redis host |
| connectionInfo.post | <code>number</code> | The redis port |
| [options] | <code>Array</code> | Used when this client creates the redis clients |

