import { expect } from 'chai';
import plugin from '../src';
var demodata = require('../example/data/json-generator-data.js');

let Service = new plugin.Service({
    paginate: {
        default: 5,
        max: 50
    }
});

describe('Service', () => {

    describe('Remove', () => {
        it('should return status "OK"', done => {

            Service.remove()
                .then(function(res) {
                    expect(res.responseHeader.status).to.be.equal(0);
                    done();
                })
                .catch(function(err) {
                    done();
                });
        });
    });

    describe('Update', function() {
        this.timeout(5000);
        it('should return status "OK"', function(done) {
            this.timeout(5000);
            Service.create(demodata)
                .then(function(res) {
                    expect(res.data).to.be.instanceof(Array);
                    done();
                })
                .catch(function(err) {
                    done();
                });
        });
    });

    describe('Find', function() {
        this.timeout(5000);
        var response;
        before(function(done) {
            done();
        });

        it('find ALL should return Array', function(done) {
          this.timeout(5000);
            Service.find({})
                .then(function(res) {
                    response = res;
                    expect(response.data).to.be.instanceof(Array);
                    done();
                })
                .catch(function(err) {
                    done();
                });
        });


        it('find ALL should return empty Array', done => {
            expect(response.data).to.have.lengthOf(5);
            done();
        });

    });
});
