// Thanks to homebridge-tplink-smarthome

class EnergyCharacteristicFactory {
    create(Characteristic) {
        class EnergyCharacteristic extends Characteristic {
            constructor(displayName, UUID, props) {
                super(displayName, UUID);
                this.setProps(Object.assign({
                    format: Characteristic.Formats.FLOAT,
                    minValue: 0,
                    maxValue: 65535,
                    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
                }, props));
                this.value = this.getDefaultValue();
            }
        }

        class Amperes extends EnergyCharacteristic {
            constructor() {
                super('Amperes', Amperes.UUID, {
                    unit: 'A',
                    minStep: 0.001,
                });
            }
        }

        Amperes.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52';

        class TotalConsumption extends EnergyCharacteristic {
            constructor() {
                super('Total Consumption', TotalConsumption.UUID, {
                    unit: 'kWh',
                    minStep: 0.001,
                });
            }
        }

        TotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

        class KilowattVoltAmpereHour extends EnergyCharacteristic {
            constructor() {
                super('Apparent Energy', KilowattVoltAmpereHour.UUID, {
                    format: Characteristic.Formats.UINT32,
                    unit: 'kVAh',
                    minStep: 1,
                });
            }
        }

        KilowattVoltAmpereHour.UUID = 'E863F127-079E-48FF-8F27-9C2605A29F52';

        class VoltAmperes extends EnergyCharacteristic {
            constructor() {
                super('Apparent Power', VoltAmperes.UUID, {
                    format: Characteristic.Formats.UINT16,
                    unit: 'VA',
                    minStep: 1,
                });
            }
        }

        VoltAmperes.UUID = 'E863F110-079E-48FF-8F27-9C2605A29F52';

        class Volts extends EnergyCharacteristic {
            constructor() {
                super('Volts', Volts.UUID, {
                    unit: 'V',
                    minStep: 0.1,
                });
            }
        }

        Volts.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52';

        class Watts extends EnergyCharacteristic {
            constructor() {
                super('Consumption', Watts.UUID, {
                    unit: 'W',
                    minStep: 0.1,
                });
            }
        }

        Watts.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';


        class ResetTotal extends EnergyCharacteristic {
            constructor() {
                super('Reset Total', ResetTotal.UUID, {
                    format: Characteristic.Formats.UINT32,
                    unit: Characteristic.Units.seconds,
                    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY, Characteristic.Perms.WRITE],
                });
            }
        }

        ResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';

        return { Amperes, KilowattVoltAmpereHour, VoltAmperes, Volts, Watts, TotalConsumption, ResetTotal };
    }
}

export default new EnergyCharacteristicFactory();
