let uuidConfig  = require('./config/config.json');

let bleno = require("@abandonware/bleno");
let util  = require('util');
let wifi  = require('node-wifi');
let exec  = util.promisify(require('child_process').exec);
let BlenoPrimaryService = bleno.PrimaryService;
let BlenoCharacteristic = bleno.Characteristic;
let BlenoDescriptor = bleno.Descriptor;

let wifiStatus = '{"status" : "Failed"}'

console.log('bleno');

let StaticReadOnlyCharacteristic = function() {
    StaticReadOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidDevice,
        properties: ['read'],
        value: Buffer.from('value'),
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',
                value: 'Spectr Display'
            })
        ]
    });
};

util.inherits(StaticReadOnlyCharacteristic, BlenoCharacteristic);


// Wifi Scan and connect after reading data received from app
let WriteOnlyCharacteristic = function() {
    WriteOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidScanConnect,
        properties: ['write']
    });
};

util.inherits(WriteOnlyCharacteristic, BlenoCharacteristic);

WriteOnlyCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
    const output = Buffer.from(data, 'hex');
    let payload = JSON.parse(String(output));

    // console.log('WriteOnlyCharacteristic write request: ' + data.toString('hex') + ' ' + offset + ' ' + withoutResponse);
    wifi.scan((error, networks) => {
        if (error) {
            console.log(error);
        } else {
            exec('sudo iwlist scan');
            // console.log(payload);
            networks.forEach(network =>{
                if(payload.ssid === network.ssid){
                    console.log("Succes, wifi found")
                    wifiStatus = '{"status" : "Success"}'
                    wifi.connect({ ssid: payload.ssid, password: payload.pwd }, error => {
                        if (error) {
                            console.log(error);
                            wifiStatus = "Failed"
                        }
                        else{
                            console.log('Connected');
                        }
                    });
                }
            });

        }
    });
    callback(this.RESULT_SUCCESS);

};

//return status
let ReadOnlyCharacteristic = function() {
    ReadOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidStatus,
        properties: ['read']
    });
};

util.inherits(ReadOnlyCharacteristic, BlenoCharacteristic);

ReadOnlyCharacteristic.prototype.onReadRequest = function (offset, callback) {
    let result = this.RESULT_SUCCESS;
    console.log(wifiStatus);
    let data = Buffer.from(wifiStatus);

    if (offset > data.length) {
        result = this.RESULT_INVALID_OFFSET;
        data = null;
    } else {
        data = data.slice(offset);
    }
    callback(result, data);
};

// Unused, but could be useful
let NotifyOnlyCharacteristic = function() {
    NotifyOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidNotification,
        properties: ['notify']
    });
};

util.inherits(NotifyOnlyCharacteristic, BlenoCharacteristic);

NotifyOnlyCharacteristic.prototype.onSubscribe = function(maxValueSize, updateValueCallback) {
    console.log('NotifyOnlyCharacteristic subscribe');

    this.counter = 0;
    this.changeInterval = setInterval(function() {
        let data = Buffer.alloc(4);
        data.writeUInt32LE(this.counter, 0);

        console.log('NotifyOnlyCharacteristic update value: ' + this.counter);
        updateValueCallback(data);
        this.counter++;
    }.bind(this), 5000);
};

NotifyOnlyCharacteristic.prototype.onUnsubscribe = function() {
    console.log('NotifyOnlyCharacteristic unsubscribe');

    if (this.changeInterval) {
        clearInterval(this.changeInterval);
        this.changeInterval = null;
    }
};


function SampleService() {
    SampleService.super_.call(this, {
        uuid: uuidConfig.uuidService,
        characteristics: [
            new StaticReadOnlyCharacteristic(),
            new WriteOnlyCharacteristic(),
            new ReadOnlyCharacteristic(),
            new NotifyOnlyCharacteristic(),
        ]
    });
}

util.inherits(SampleService, BlenoPrimaryService);

bleno.on('stateChange', function(state) {
    console.log('on -> stateChange: ' + state + ', address = ' + bleno.address);

    if (state === 'poweredOn') {
        bleno.startAdvertising('SpectR Display', [uuidConfig.uuidDevice]);
        wifi.init({
            iface: null // network interface, choose a random wifi interface if set to null
        });

    } else {
        bleno.stopAdvertising();
    }
});

// Linux only events /////////////////
bleno.on('accept', function(clientAddress) {
    console.log('on -> accept, client: ' + clientAddress);
    console.log()
    bleno.updateRssi();

});

bleno.on('disconnect', function(clientAddress) {
    console.log('on -> disconnect, client: ' + clientAddress);
});

bleno.on('rssiUpdate', function(rssi) {
    console.log('on -> rssiUpdate: ' + rssi);
});
//////////////////////////////////////

bleno.on('mtuChange', function(mtu) {
    console.log('on -> mtuChange: ' + mtu);
});

bleno.on('advertisingStart', function(error) {
    console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));

    if (!error) {
        bleno.setServices([
            new SampleService()
        ]);
    }
});

bleno.on('advertisingStop', function() {
    console.log('on -> advertisingStop');
});

bleno.on('servicesSet', function(error) {
    console.log('on -> servicesSet: ' + (error ? 'error ' + error : 'success'));
});
