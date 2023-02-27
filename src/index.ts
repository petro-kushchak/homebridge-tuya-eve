import { API } from 'homebridge';
import { TuyaSwitchAccessory } from './tuyaSwitchAccessory';


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
