let uuidConfig  = require('./config/config.json');
let bleno = require("@abandonware/bleno");
let util  = require('util');
let wifi  = require('node-wifi');

let BlenoPrimaryService = bleno.PrimaryService;
let BlenoCharacteristic = bleno.Characteristic;
let BlenoDescriptor = bleno.Descriptor;
let wifiStatus = '{"status" : "neutral"}'

let wifiList = [];

function ab2str(buf) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
}
function str2ab(str) {
    let buf = new ArrayBuffer(str.length*2); // 2 bytes for each char
    let bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

console.log('Starting service');

let StaticReadOnlyCharacteristic = function() {
    StaticReadOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidDevice,
        properties: ['read'],
        value: Buffer.from('value'),
        descriptors: [
            new BlenoDescriptor({
                uuid: '2901',
                value: 'RPI BLE'
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
    let payload = data.toString()

// I'd rather using json, but JSON.parse(payload) result in an error I couldn't fix
    let wifiData = payload.split('|');

    let ssid = wifiData[0];
    let pwd = wifiData[1];
    payload = {
        ssid: ssid.replace(/\x00/g, ""),
        password: pwd.replace(/\x00/g, ""),
    };
    if(wifiList.includes(payload.ssid)){
        wifi.connect({ssid : payload.ssid , password: payload.password}, error => {
            if (error) {
                this.wifiStatus = '{"status" : "Wrong password"}'
                console.log(error);
            }else{
                console.log('Connected');
                this.wifiStatus = '{"status" : "Success"}'
                console.log(this.wifiStatus)
                bleno.stopAdvertising()
            }
        });
    }
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


let DebugOnly = function() {
    DebugOnly.super_.call(this, {
        uuid: "ff03548",
        properties: ['read']
    });
};

util.inherits(DebugOnly, BlenoCharacteristic);

DebugOnly.prototype.onReadRequest = function (offset, callback) {


    console.log('DEBUG');
    wifiList = [];
    let i = 0;
    wifi
        .scan()
        .then(networks => {
            networks.forEach(network => {
                if(network.ssid !== '' && !wifiList.includes(network.ssid)){
                    wifiList.push(new TextEncoder("utf-8").encode(network.ssid))
                    console.log(data)
                    console.log('SSID: ' + network.ssid);
                }
            })
        })
        .catch(error => {
            console.log(error);
        });
    let result = this.RESULT_SUCCESS;
    console.log(wifiList);
    let data = Buffer.from(wifiList);

    callback(result, data);
};

// Scans for Wi-Fi, then sends data back to the phone, since Ionic can't scan for Wi-Fi (Unless it's the current connected network)
let NotifyOnlyCharacteristic = function() {
    NotifyOnlyCharacteristic.super_.call(this, {
        uuid: uuidConfig.uuidNotification,
        properties: ['notify']
    });
};

util.inherits(NotifyOnlyCharacteristic, BlenoCharacteristic);

NotifyOnlyCharacteristic.prototype.onSubscribe = function(maxValueSize, updateValueCallback) {
    console.log('NotifyOnlyCharacteristic subscribe');
    let wifiname = '';
    wifiList = [];
    wifi.scan().then(networks => {
            let counter = 0
            console.log(networks.length)
            updateValueCallback(new TextEncoder().encode('START'))
            console.log('START')
            while(counter < networks.length){
                if(networks[counter].ssid !== ''){
                    wifiname = networks[counter].ssid
                    console.log('SSID: ' + wifiname)
                    wifiList.push(wifiname)
                    updateValueCallback(new TextEncoder().encode(wifiname));
                }
                ++counter;
            }
            updateValueCallback(new TextEncoder().encode('END'))
            console.log('END')
        }
    )
        .catch(error => {
            console.log(error);
        });
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
            new DebugOnly(),
            new NotifyOnlyCharacteristic(),
        ]
    });
}

util.inherits(SampleService, BlenoPrimaryService);

bleno.on('stateChange', function(state) {
    console.log('on -> stateChange: ' + state + ', address = ' + bleno.address);

    if (state === 'poweredOn') {
        bleno.startAdvertising('RPI BLE', [uuidConfig.uuidDevice]);
        wifi.init({
            iface: null // network interface, choose a random wifi interface if set to null
        });

    } else {
        bleno.stopAdvertising();
    }
});

// Linux only events /////////////////
bleno.on('accept', function(clientAddress) {
    console.log("////////////////////////////////////////")
    console.log('on -> accept, client: ' + clientAddress);
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
    console.log(this.wifiStatus)
    console.log('on -> advertisingStop');
});

bleno.on('servicesSet', function(error) {
    console.log('on -> servicesSet: ' + (error ? 'error ' + error : 'success'));
});
