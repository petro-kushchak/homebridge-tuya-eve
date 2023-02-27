import { API } from 'homebridge';
import { TuyaSwitchAccessory } from './lib/tuyaSwitchAccessory';


/*
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  api.registerAccessory(
    'homebridge-tuya-eve',
    'TuyaSwitchEve',
    TuyaSwitchAccessory,
  );
};
