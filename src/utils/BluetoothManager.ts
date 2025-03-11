import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

export const startScan = () => {
	manager.startDeviceScan(null, null, (error, device) => {
		if (error) {
			console.error("Scan error:", error);
			return;
		}
		if (device && device.name) {
			console.log("Device found:", device.name);
		} else {
			console.log("Device found without name");
		}
	});

	// Stop scanning after 20 seconds
  setTimeout(() => {
    manager.stopDeviceScan();
    console.log("Scan stopped");
  }, 20000);
};

export default manager;
