## Classes

<dl>
<dt><a href="#MultiRedisClient">MultiRedisClient</a> ⇐ <code>EventEmitter</code></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#ConnectionInfo">ConnectionInfo</a> : <code>Object</code></dt>
<dd><p>Holds connection info configuration.</p>
</dd>
</dl>

<a name="MultiRedisClient"></a>

## MultiRedisClient ⇐ <code>EventEmitter</code>
**Kind**: global class  
**Extends**: <code>EventEmitter</code>  
**Access**: public  
**Author**: Sagie Gur-Ari  

* [MultiRedisClient](#MultiRedisClient) ⇐ <code>EventEmitter</code>
    * [new MultiRedisClient(params)](#new_MultiRedisClient_new)
    * [.connected](#MultiRedisClient.connected) : <code>Boolean</code>
    * [.server_info](#MultiRedisClient.server_info) : <code>Object</code>
    * _static_
        * [.createClient(clients, [options])](#MultiRedisClient.createClient) ⇒ [<code>MultiRedisClient</code>](#MultiRedisClient)
        * [.createClient(connectionInfo, [options])](#MultiRedisClient.createClient) ⇒ [<code>MultiRedisClient</code>](#MultiRedisClient)

<a name="new_MultiRedisClient_new"></a>

### new MultiRedisClient(params)
Proxies requests to one or more redis clients.


| Param | Type | Default | Description |
| --- | --- | --- | --- |
| params | <code>Object</code> |  | The client init params |
| [params.clients] | <code>Array.&lt;redis&gt;</code> \| <code>redis</code> |  | The redis client/s (if not provided, the connection info must be provided instead) |
| [params.connectionInfo] | [<code>Array.&lt;ConnectionInfo&gt;</code>](#ConnectionInfo) \| [<code>ConnectionInfo</code>](#ConnectionInfo) |  | The redis client/s connection info (if not provided, the redis clients must be provided) |
| [params.options] | <code>Object</code> |  | Used when this client creates the redis clients (see redis module for more details) |
| [params.options.childCommandTimeout] | <code>Number</code> | <code>10000</code> | The per client command timeout |
| [params.options.mergeDuplicateEndpoints] | <code>Boolean</code> | <code>true</code> | True to merge duplicate endpoint configurations and prevent needless redis client connections |

<a name="MultiRedisClient.connected"></a>

### MultiRedisClient.connected : <code>Boolean</code>
True when at least one internal redis client is connected.

**Access**: public  
<a name="MultiRedisClient.server_info"></a>

### MultiRedisClient.server_info : <code>Object</code>
After the ready probe completes, the results from the INFO command are saved in this attribute.

**Access**: public  
<a name="MultiRedisClient.createClient"></a>

### MultiRedisClient.createClient(clients, [options]) ⇒ [<code>MultiRedisClient</code>](#MultiRedisClient)
Creates and returns a new MultiRedisClient instance.

**Kind**: static method of [<code>MultiRedisClient</code>](#MultiRedisClient)  
**Returns**: [<code>MultiRedisClient</code>](#MultiRedisClient) - The multiple redis client instance  
**Access**: public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| clients | <code>Array.&lt;redis&gt;</code> \| <code>redis</code> |  | The redis client/s |
| [options] | <code>Object</code> |  | Various options |
| [options.childCommandTimeout] | <code>Number</code> | <code>10000</code> | The per client command timeout |

**Example**  
```js
//create multiple redis clients
var redis = require('redis');
var client1 = redis.createClient(...);
var client2 = redis.createClient(...);

//create the wrapper client
var MultipleRedis = require('multiple-redis');
var multiClient = MultipleRedis.createClient([client1, client2]);

multiClient.once('ready', function onReady() {
  //run any command on the multi client instead of the original clients
  multiClient.set('string key', 'string val', callback);
});
```
<a name="MultiRedisClient.createClient"></a>

### MultiRedisClient.createClient(connectionInfo, [options]) ⇒ [<code>MultiRedisClient</code>](#MultiRedisClient)
**Kind**: static method of [<code>MultiRedisClient</code>](#MultiRedisClient)  
**Returns**: [<code>MultiRedisClient</code>](#MultiRedisClient) - The multiple redis client instance  
**Access**: public  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| connectionInfo | [<code>Array.&lt;ConnectionInfo&gt;</code>](#ConnectionInfo) \| [<code>ConnectionInfo</code>](#ConnectionInfo) |  | The redis client/s connection info |
| [options] | <code>Object</code> |  | Used when this client creates the redis clients (see redis module for more details) |
| [options.childCommandTimeout] | <code>Number</code> | <code>10000</code> | The per client command timeout |
| [options.mergeDuplicateEndpoints] | <code>Boolean</code> | <code>true</code> | True to merge duplicate endpoint configurations and prevent needless redis client connections |

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

multiClient.once('ready', function onReady() {
  //run any command on the multi client instead of the original clients
  multiClient.set('string key', 'string val', callback);
});
```
<a name="ConnectionInfo"></a>

## ConnectionInfo : <code>Object</code>
Holds connection info configuration.

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| host | <code>String</code> | The redis host |
| port | <code>Number</code> | The redis port |

