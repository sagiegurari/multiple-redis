<a name="MultiRedisClient"></a>
## MultiRedisClient ⇐ <code>EventEmitter</code>
**Kind**: global class  
**Extends:** <code>EventEmitter</code>  
**Access:** public  
**Author:** Sagie Gur-Ari  

* [MultiRedisClient](#MultiRedisClient) ⇐ <code>EventEmitter</code>
  * [new MultiRedisClient(params)](#new_MultiRedisClient_new)
  * [.connected](#MultiRedisClient.connected) : <code>boolean</code>
  * [.server_info](#MultiRedisClient.server_info) : <code>object</code>
  * [#getUniqueEndpoints(connectionInfo)](#MultiRedisClient+getUniqueEndpoints) ⇒ <code>Array</code> ℗
  * [#resetState()](#MultiRedisClient+resetState) ℗
  * [.setupPrototype()](#MultiRedisClient.setupPrototype) ℗
  * _static_
    * [.createClient(clients, [options])](#MultiRedisClient.createClient) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
    * [.createClient(connectionInfo, [options])](#MultiRedisClient.createClient) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>

<a name="new_MultiRedisClient_new"></a>
### new MultiRedisClient(params)
Proxies requests to one or more redis clients.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>object</code> |  | The client init params |
| [params.clients] | <code>Array</code> &#124; <code>redis</code> |  | The redis client/s (if not provided, the connection info must be provided instead) |
| [params.connectionInfo] | <code>Array</code> &#124; <code>object</code> |  | The redis client/s connection info (if not provided, the redis clients must be provided) |
| [params.connectionInfo.host] | <code>string</code> |  | The redis host |
| [params.connectionInfo.port] | <code>number</code> |  | The redis port |
| [params.options] | <code>Array</code> |  | Used when this client creates the redis clients (see redis module for more details) |
| [params.options.childCommandTimeout] | <code>number</code> | <code>10000</code> | The per client command timeout |
| [params.options.mergeDuplicateEndpoints] | <code>boolean</code> | <code>true</code> | True to merge duplicate endpoint configurations and prevent needless redis client connections |

<a name="MultiRedisClient.connected"></a>
### MultiRedisClient.connected : <code>boolean</code>
True when at least one internal redis client is connected.

**Access:** public  
<a name="MultiRedisClient.server_info"></a>
### MultiRedisClient.server_info : <code>object</code>
After the ready probe completes, the results from the INFO command are saved in this attribute.

**Access:** public  
<a name="MultiRedisClient+getUniqueEndpoints"></a>
### MultiRedisClient#getUniqueEndpoints(connectionInfo) ⇒ <code>Array</code> ℗
Returns the connection info array without duplicates.

**Returns**: <code>Array</code> - The connection info array without duplicates  
**Access:** private  

| Param | Type | Description |
| --- | --- | --- |
| connectionInfo | <code>Array</code> | The redis client/s connection info |
| connectionInfo.host | <code>string</code> | The redis host |
| connectionInfo.port | <code>number</code> | The redis port |

<a name="MultiRedisClient+resetState"></a>
### MultiRedisClient#resetState() ℗
Resets the redis attributes based on the status of the internal redis clients.

**Access:** private  
<a name="MultiRedisClient.setupPrototype"></a>
### MultiRedisClient.setupPrototype() ℗
Adds all functions with proxy capabilities.

**Access:** private  
<a name="MultiRedisClient.createClient"></a>
### MultiRedisClient.createClient(clients, [options]) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
Creates and returns a new MultiRedisClient instance.

**Kind**: static method of <code>[MultiRedisClient](#MultiRedisClient)</code>  
**Returns**: <code>[MultiRedisClient](#MultiRedisClient)</code> - The multiple redis client instance  
**Access:** public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| clients | <code>Array</code> &#124; <code>redis</code> |  | The redis client/s |
| [options] | <code>Array</code> |  | Various options |
| [options.childCommandTimeout] | <code>number</code> | <code>10000</code> | The per client command timeout |

**Example**  
```js
//create multiple redis clients
var redis = require('redis');
var client1 = redis.createClient(...);
var client2 = redis.createClient(...);

//create the wrapper client
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([client1, client2]);

//run any command on the multi client instead of the original clients
multiClient.set('string key', 'string val', callback);
```
<a name="MultiRedisClient.createClient"></a>
### MultiRedisClient.createClient(connectionInfo, [options]) ⇒ <code>[MultiRedisClient](#MultiRedisClient)</code>
**Kind**: static method of <code>[MultiRedisClient](#MultiRedisClient)</code>  
**Returns**: <code>[MultiRedisClient](#MultiRedisClient)</code> - The multiple redis client instance  
**Access:** public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| connectionInfo | <code>Array</code> &#124; <code>object</code> |  | The redis client/s connection info |
| connectionInfo.host | <code>string</code> |  | The redis host |
| connectionInfo.port | <code>number</code> |  | The redis port |
| [options] | <code>Array</code> |  | Used when this client creates the redis clients (see redis module for more details) |
| [options.childCommandTimeout] | <code>number</code> | <code>10000</code> | The per client command timeout |
| [options.mergeDuplicateEndpoints] | <code>boolean</code> | <code>true</code> | True to merge duplicate endpoint configurations and prevent needless redis client connections |

**Example**  
```js
//create the wrapper client with connection info
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([{
  host: 'host1',
  port: 6379
}, {
  host: 'host2',
  port: 6379
}], options);

//run any command on the multi client instead of the original clients
multiClient.set('string key', 'string val', callback);
```
