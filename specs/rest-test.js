/**
 * Test for creating, lookuping and removing zones
 * 
 * Note: Test remove zones from HOST and NS2 because PowerDNS slave can't remove zone automaticaly
 * 
 * See also: 
 * https://doc.powerdns.com/md/httpapi/api_spec/
 * https://raw.githubusercontent.com/PowerDNS/pdns/master/docs/http-api/swagger/authoritative-api-swagger.yaml
 *
 * createZone(name, params)
 * createRecord(zone, type, name, data, params)
 * deleteZone(name)
 * 
 */
const 
    pdns_config = require('../pdns-config.json'), // only for check
    rest_config = require('../rest-config.json'), 
    TEST_ZONES = require('./domains'),
    BASE_URL = 'http://' + (rest_config.host || 'localhost') + ':' + (rest_config.port || 8082);


const RestDNS = require('../lib/rest-wrap');
const {echo, nslookup} = require('./misc');

let rest_dns = new RestDNS(BASE_URL, rest_config.token)

let run = new Promise(resolve => resolve())

// create all CNAME from zones
run = TEST_ZONES.reduce((next, el) => next
    .then(echo(rest_dns, rest_dns.createDomain, el.domain, el.ip)).then(console.log)
    .then(echo(rest_dns, rest_dns.createCname,  el.domain, 'www')).then(console.log)
, run);

// check
run = TEST_ZONES.reduce((next, el) => next
    .then(echo(this, nslookup, el.domain, pdns_config.ns1)).then(console.log)
    .then(echo(this, nslookup, 'www.' + el.domain, pdns_config.ns2)).then(console.log)
, run);

// remove
run = TEST_ZONES.reduce((next, el) => next
     .then(echo(rest_dns, rest_dns.deleteDomain, el.domain))
, run);
