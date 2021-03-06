/**
 * Create wrap interface for PowerDNS REST
 * API like https://developers.digitalocean.com/documentation/v2/#domains
 * 
 * POST   /domains << {name:'mydomen.com', ip_address: '192.168.1.69'}  
 * GET    /domains/:zone
 * PUT    /domains/:zone << {ip_address: '192.168.1.69'}  
 * DELETE /domains/:zone
 * 
 * GET    /domains/:zone/records? type & name & ttl       -- filtered records list
 * GET    /domains/:zone/records/:type                    -- list of records with specified type 
 * GET    /domains/:zone/records/:type/:name              -- get one record
 * POST   /domains/:zone/records<<{type,name,ttl,content} -- create a record
 * DELETE /domains/:zone/records/:type/:name              -- remove record
 * 
 */
const express = require('express'),
    bodyParser = require('body-parser'),
    PowerDNS = require('./powerdns');

/**
 * Create router for control
 * 
 * @param config
 * @param config.host - restapi host
 * @param config.port - restapi port
 * @param config.token- restapi token
 * @param config.ns1 - master server
 * @param config.ns2 - slave server
 * 
 */
module.exports = function(config) {
    // init api access
    let master = new PowerDNS(config.host, config.port, config.token, [config.ns1+'.', config.ns2+'.']) // list of ns need to create zones
    let slave  = new PowerDNS(config.ns2,  config.port, config.token)

    let router = express.Router();
    
    // to support JSON-encoded bodies
    router.use(bodyParser.json()); 
    router.use(bodyParser.urlencoded({ extended: true })); // to support URL-encoded bodies
    
    
    /**
     * Create new zone  
     * POST /domains << {name:'mydomen.com', ip_address: '192.168.1.69'}  
     *
     * @param {JSON} body - request body
     * @param {String} body.name - zone name
     * @param {String} body.ip_address - ip to join
     * @param {Integer} body.ttl - ttl for A record 
     */
    router.post('/', function (req, res) {
        let zone = req.body.name; 
        let ip_address = req.body.ip_address;
        let params = {};
        if (req.body.ttl)
            params.ttl = req.body.ttl;
            
        new Promise(resolve => resolve())
        .then(()=> master.createZone(zone, { hostmaster: 'hostmaster.'+ config.ns1, soa_edit_api: 'EPOCH' }) )
        .then(()=> master.createRecord(zone, 'A', `${zone}.`, ip_address, params))
        
        .then (request_result.bind(this, res, 201))
        .catch(request_result.bind(this, res))
    });
    
    
    /**
     * Modify domain's properties  
     * Note: now support 'ip_address' only
     * PUT /domains/$DOMAIN_NAME << {ip_address: '192.168.1.69'}  
     *
     * @param {String} zone - zone (domain) name
     * @param {JSON} body - request body
     * @param {String} body.ip_address
     */
    router.put('/:zone', function (req, res) {
        let zone = req.params.zone;
        let ip_address = req.body.ip_address;
        
        new Promise(resolve => resolve())
        .then(()=> master.createRecord(zone, 'A', `${zone}.`, ip_address))
        .then (request_result.bind(this, res, 0))
        .catch(request_result.bind(this, res))
    });
    
    
    /**
     * GET /${domain}
     * @param zone - domain name
     */
    router.get('/:zone', function (req, res) { // type,name,ttl,data
        new Promise(resolve => resolve())
        .then(()=> master.getZone(req.params.zone))
        .then (request_result.bind(this, res, 0))
        .catch(request_result.bind(this, res))
    });
    
    
    /**
     * Delete zone  
     * DELETE /domains/:zone  
     * @param zone - zone name
     */
    router.delete('/:zone', function (req, res) {
        new Promise(resolve => resolve())
        .then(()=> master.deleteZone(req.params.zone))
        .then(res=> new Promise(resolve => {
            slave.deleteZone(req.params.zone)
                .then(resolve)
                .catch(error => {
                    resolve(res);
                })
        }))
        .then(request_result.bind(this, res, 0))
        .catch(request_result.bind(this, res))
    });
        
    
    /**
     * Get domain records list
     * GET /:zone/records? type & name & ttl
     * @param {String} zone - zone(domain) name
     * @param {JSON} query - include filter for fileds (type, name, ttl)
     * @return {Object[]} - filtered list of zone records = [{ type:"A", name:"a.com.", records:[{content:"10.0.0.1"}], ttl:86400 }]
     * @example GET /domain.com/records << {type: 'CNAME'}
     */
    router.get('/:zone/records', function (req, res) {
        new Promise(resolve => resolve())
        .then(()=> master.getZone(req.params.zone)) // req.query.type, req.query.name, req.query.data, req.query.ttl
        .then(data => {
            if (data && data.rrsets) {
                data = data.rrsets;
                if (req.query) 
                    data = data.filter(item => {
                        for (p in req.query) {
                            if (item[p] != req.query[p]) return false;
                        }
                        return true;
                    })
                request_result(res, 0, data)
            }
            else
                request_result(res, 'Error: wrong data')
        })
        .catch(request_result.bind(this, res))
    });
    
    /**
     * Get domain records list by type
     * GET /:zone/records/:type
     * @param {String} zone - zone(domain) name
     * @param {String} type - a,aaaa,cname
     * @return {Object[]} - filtered list of zone records = [{ type:"A", name:"a.com.", records:[{content:"10.0.0.1"}], ttl:86400 },...]
     * @example GET /domain.com/records/A
     */
    router.get('/:zone/records/:type', function (req, res) {
        new Promise(resolve => resolve())
        .then(()=> master.getZone(req.params.zone))
        .then(data => {
            if (data && data.rrsets) {
                data = data.rrsets.filter(item => (item.type==req.params.type.toUpperCase()))
                request_result(res, 0, data)
            }
            else
                request_result(res, 'Error: wrong data')
        })
        .catch(request_result.bind(this, res))
    });
    
    
    /**
     * Get domain one record by type and name
     * GET /:zone/records/:type/:name
     * @param {String} zone - zone(domain) name
     * @param {String} type - a,aaaa,cname
     * @param {String} name - name of record
     * @return {Object[]} - filtered list of zone records = { type:"A", name:"a.com.", records:[{ content:"10.0.0.1" }], "ttl":86400 }

     * @example GET /domain.com/records/A/a.com.
     */
    router.get('/:zone/records/:type/:name', function (req, res) {
        new Promise(resolve => resolve())
        .then(()=> master.getZone(req.params.zone))
        .then(data => {
            if (data && data.rrsets) {
                data = data.rrsets.filter(item => 
                       (item.type==req.params.type.toUpperCase()) 
                    && (item.name==req.params.name))
                request_result(res, 0, data[0])
            }
            else
                request_result(res, 'Error: wrong data')
        })
        .catch(request_result.bind(this, res))
    });
    
    
    /**
     * Create custom DNS records
     * POST /domains/:zone/records << {type,name,ttl,content}
     *      type=A,AAAA; data=IP; [ttl=1800]
     *      type=CNAME; name=www.mydomen.com.; [ttl=1800]
     * 
     * Note: for CNAME records pdns support only full alias name (with main domain)
     * 
     * @param {String} zone - zone(domain) name
     * @param {JSON} body - request body
     * @param {String} body.name - for CNAME = `www.${domain}.`
     * @param {String} body.type - now supported CNAME | A | AAAA
     * @param {String} body.content - for CNAME = `${domain}.`
     * @param {Integer} body.ttl
     * @expamle master.createRecord,   el.domain, 'CNAME', `www.${el.domain}.`, `${el.domain}.`))
     * @expamle {"name": "test.example.org.", "type": "A", "ttl": 86400, "content": "192.0.5.4"} 
     */
    router.post('/:zone/records', function (req, res) { // type,name,ttl,data
        let params = {};
        if (req.body.ttl)
            params.ttl = req.body.ttl;
        
        new Promise(resolve => resolve())
        .then(()=> master.createRecord(req.params.zone, req.body.type, req.body.name, req.body.content, params))
        .then (request_result.bind(this, res, 0))
        .catch(request_result.bind(this, res))
    });
    
    /**
     * Remove record
     * DELETE /:zone/records/:type/:name
     * 
     * @param {String} zone
     * @param {String} type
     * @param {String} name
     */
    router.delete('/:zone/records/:type/:name', function (req, res) { // type,name,ttl,data
        new Promise(resolve => resolve())
        .then(()=> master.deleteRecord(req.params.zone, req.params.type, req.params.name))
        .then(request_result.bind(this, res, 0))
        .catch(request_result.bind(this, res))
    });
    
    
    return router;
};


function request_result(res, error, data) {
    let result;
    if (error && isNaN(error)) {
        // re-pack error message
        error = error.message || error;
        if (typeof error == 'string') {
            try {
                error = JSON.parse(error)
            }
            catch(e){}
        }
        error = error.error || error;
        res.status(400).json({ error });
    }
    else {
        res.status(error ||200).json({ data: data||'' });
    }
}
