import {
    Service,
    Logging,
    AccessoryConfig,
    API,
    AccessoryPlugin,
    CharacteristicValue,
    CharacteristicEventTypes,
  } from 'homebridge';
  import {
    EveHistoryService,
    HistoryServiceEntry,
  } from './lib/eveHistoryService';

  import TuyaDevice from 'tuyapi';
  import EnergyCharacteristicFactory from './lib/EnergyCharacteristics';
  import { callbackify } from './lib/homebridgeCallbacks';


const ONOFF_DP = '1';
const AMP_DP = '18';
const WATT_DP = '19';
const VOLT_DP = '20';
const kHour = 60 * 60 * 1000;


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class TuyaSwitchAccessory implements AccessoryPlugin {
    private readonly name: string;
    private readonly serial: string;
    private readonly model: string;
    private readonly id: string;
    private readonly key: string;
    private readonly updateInterval: number;
    private readonly log: Logging;
    private readonly displayName: string;

    private readonly service: Service;
    private readonly informationService: Service;
    private readonly historyService: EveHistoryService;

    private readonly device: TuyaDevice;

    private readonly EnergyCharacteristics;

    private amperes = 0;
    private watts = 0;
    private volts = 0;
    private inUse = false;

    private totalConsumption = 0;
    private resetTotal = 0;

    private setupTimeout: NodeJS.Timeout;

    constructor(
      private logger: Logging,
      private config: AccessoryConfig,
      private api: API,
    ) {

      this.log = logger;

      this.name = config.name;
      this.displayName = this.name;
      this.serial = config.serial;
      this.id = config.id;
      this.key = config.key;
      this.model = config.model || 'TuyaSwitch';
      this.updateInterval = config.updateInterval || 5000;

      this.EnergyCharacteristics = EnergyCharacteristicFactory.create(
        api.hap.Characteristic,
      );

      this.device = new TuyaDevice({
        id: this.id,
        key: this.key,
        issueRefreshOnConnect: true,
      });

      // Set AccessoryInformation

      this.informationService = new api.hap.Service.AccessoryInformation()
        .setCharacteristic(api.hap.Characteristic.Name, this.name)
        .setCharacteristic(api.hap.Characteristic.Manufacturer, 'Tuya')
        .setCharacteristic(api.hap.Characteristic.Model, this.model)
        .setCharacteristic(api.hap.Characteristic.SerialNumber, this.serial);

      // create a new Thermostat service
      this.service = new api.hap.Service.Switch(this.name);

      this.service
        .getCharacteristic(api.hap.Characteristic.On)
        .on(
          CharacteristicEventTypes.GET,
          callbackify(this.getPowerOnOff.bind(this)),
        )
        .on(
          CharacteristicEventTypes.SET,
          callbackify(this.setPowerOnOff.bind(this)),
        );

      this.service.addOptionalCharacteristic(this.EnergyCharacteristics.Volts);
      this.service.addOptionalCharacteristic(this.EnergyCharacteristics.Amperes);
      this.service.addOptionalCharacteristic(this.EnergyCharacteristics.Watts);
      this.service.addOptionalCharacteristic(
        this.EnergyCharacteristics.TotalConsumption,
      );
      this.service.addOptionalCharacteristic(
        this.EnergyCharacteristics.ResetTotal,
      );

      this.service
        .getCharacteristic(this.EnergyCharacteristics.Volts)
        .on('get', this.getVoltage.bind(this))
        .updateValue(this.volts);
      this.service
        .getCharacteristic(this.EnergyCharacteristics.Amperes)
        .on('get', this.getCurrent.bind(this))
        .updateValue(this.amperes);
      this.service
        .getCharacteristic(this.EnergyCharacteristics.Watts)
        .on('get', this.getConsumption.bind(this))
        .updateValue(this.watts);

      this.service
        .getCharacteristic(this.EnergyCharacteristics.TotalConsumption)
        .on('get', this.getTotalConsumption.bind(this));

      // create handlers for required characteristics

      this.historyService = new EveHistoryService(
        this,
        this.api,
        'energy',
        // this.historyFilename,
        this.logger,
      );
      this.readTotalConsumption();

      //device events
      this.setupTimeout = setInterval(async () => {
        this.setupDevice();
      }, 1000);
    }

    async setupDevice() {
      if (!this.setupTimeout) {
        this.log('Connected to device!');
        return;
      }
      this.device.on('connected', () => {
        this.log('Connected to device!');

        const lastTime = new Date().getTime();
        setInterval(async () => {
          const now = new Date().getTime();
          const delta = (now - lastTime) / 1000;

          try {
            const state = await this.device.get({ schema: true });
            this.log(`Device state: ${JSON.stringify(state)}`);
            this.updateState(state.dps);
          } catch (ex) {
            this.log(`Device state error: ${ex}`);
            if (!this.device.isConnected()) {
              this.log('Device disconnected... trying to reconnect');
              await this.device.connect();
              return;
            }
          }

          const consumption = this.watts * delta; // W/s
          this.totalConsumption += consumption / kHour;

          this.historyService.addEntry({ time: now / 1000, power: this.watts });

          const extra = this.historyService.getExtraPersistedData();
          if (!extra) {
            this.historyService.setExtraPersistedData({
              totalConsumption: this.totalConsumption,
              resetTotal: this.resetTotal,
            });
          } else if (
            extra.totalConsumption !== this.totalConsumption ||
            extra.resetTotal !== this.resetTotal
          ) {
            extra.totalConsumption = this.totalConsumption;
            extra.resetTotal = this.resetTotal;
            this.historyService.setExtraPersistedData(extra);
          }
        }, this.updateInterval);
      });

      this.device.on('disconnected', () => {
        this.log('Disconnected from device!');
      });

      this.device.on('error', (error) => {
        this.log(`Error ${error}!`);
      });

      this.device.on('data', (data) => {
        this.log(`DATA ${JSON.stringify(data)}!`);
        this.updateState(data.dps);
      });

      this.device.on('dp-refresh', (data) => {
        this.log(`REFRESH ${JSON.stringify(data)}!`);
        this.updateState(data.dps);
      });

      try {
        //device find&connect
        await this.device.find();
        await this.device.connect();
        clearInterval(this.setupTimeout);
        this.setupTimeout = null;
      } catch (ex) {
        this.log(`Device connect error: ${ex}`);
        if (!this.device.isConnected()) {
          this.log('Device disconnected... trying to reconnect');
          return;
        }
      }
    }

    getTotalConsumption(callback) {
      callback(null, this.totalConsumption);
    }

    getResetTotal(callback) {
      callback(null, this.resetTotal);
    }

    setResetTotal(value, callback) {
      this.log.info(`setResetTotal: ${value}`);
      this.resetTotal = value;
      this.totalConsumption = 0;
      callback(null, this.resetTotal);
    }

    getVoltage(callback) {
      // this.updateState(this.device.state);
      callback(null, this.volts);
    }

    getCurrent(callback) {
      // this.updateState(this.device.state);
      callback(null, this.amperes);
    }

    getConsumption(callback) {
      // this.updateState(this.device.state);
      callback(null, this.watts);
    }

    updateState(dps) {
      this.amperes = dps[AMP_DP] ? dps[AMP_DP] / 1000 : 0;
      this.watts = dps[WATT_DP] ? dps[WATT_DP] / 10 : 0;
      this.volts = dps[VOLT_DP] ? dps[VOLT_DP] / 10 : 0;
      this.inUse = dps[ONOFF_DP] ? dps[ONOFF_DP] : false;

      this.log.info(
        `updated a:${this.amperes} w:${this.watts} v:${this.volts} on: ${this.inUse}`,
      );
    }

    async setPowerOnOff(value: CharacteristicValue): Promise<void> {
      this.log.info(`SET ON: ${value}`);
      await this.device.set({ set: value, dps: '1' });
    }

    async getPowerOnOff(): Promise<CharacteristicValue> {
      const status = await this.device.get();
      this.log.info(`GET ON: ${status.dps[1]}`);
      return status.dps[1];
    }

    readTotalConsumption() {
      this.historyService.readHistory(
        (
          lastEntry: string,
          history: HistoryServiceEntry[],
          extra: HistoryServiceEntry,
        ) => {
          const lastItem = history.pop();
          if (lastItem) {
            this.log.info('History: last item: %s', lastItem);
          } else {
            this.log.info('History: no data');
          }
          this.log.info('History: extra: %s', extra);

          const totalConsumption = extra.totalConsumption
            ? extra.totalConsumption
            : 0.0;
          const resetTotal = extra.resetTotal ? extra.resetTotal : 0; // Math.floor(Date.now() / 1000) - 978307200  // seconds since 01.01.2001

          this.log.info(
            `totalConsumption: ${totalConsumption} resetTotal: ${resetTotal}`,
          );
          this.totalConsumption = totalConsumption;
          this.resetTotal = resetTotal;
        },
      );

      // try {
      //   const filepath = this.api ? this.api.user.storagePath() : './config';
      //   const filename = path.join(filepath, this.historyFilename);
      //   this.log.info(`Reading history: ${filename}`);
      //   const data = fs.readFileSync(filename, 'utf8');
      //   const jsonData = typeof data === 'object' ? data : JSON.parse(data);
      //   const totalConsumption =
      //     jsonData.extra && jsonData.extra.totalConsumption
      //       ? jsonData.extra.totalConsumption
      //       : 0.0;
      //   const resetTotal =
      //     jsonData.extra && jsonData.extra.resetTotal
      //       ? jsonData.extra.resetTotal
      //       : 0; // Math.floor(Date.now() / 1000) - 978307200  // seconds since 01.01.2001

      //   this.log.info(
      //     `totalConsumption: ${totalConsumption} resetTotal: ${resetTotal}`,
      //   );
      //   this.totalConsumption = totalConsumption;
      //   this.resetTotal = resetTotal;
      // } catch (err) {
      //   this.log.error(`readTotalConsumption error: ${err}`);
      //   this.totalConsumption = 0;
      //   this.resetTotal = 0;
      // }
    }

    getServices(): Service[] {
      return [
        this.informationService,
        this.service,
        this.historyService.getService(),
      ];
    }
  }
