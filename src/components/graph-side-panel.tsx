import * as React from "react";
import { Format } from "../utils/format";
import { SensorSlot } from "../models/sensor-slot";
import { SensorDefinitions } from "../models/sensor-definitions";
import { ISensorConfigColumnInfo } from "../models/sensor-connector-interface";
import Button from "./smart-highlight-button";
import Select from "./smart-highlight-select";

interface IGraphSidePanelProps {
  width?:number;
  sensorSlot:SensorSlot;
  sensorColumns:ISensorConfigColumnInfo[];
  sensorPrecision:number;
  onSensorSelect?:(sensorIndex:number, columnID:string) => void;
  onZeroSensor?:() => void;
}

export const GraphSidePanel: React.SFC<IGraphSidePanelProps> = (props) => {
  const { sensorSlot, onZeroSensor, onSensorSelect } = props,
        { sensor } = sensorSlot,
        tareValue = sensor.tareValue || 0,
        sensorUnitStr = sensor.valueUnit || "";
  
  const handleZeroSensor = () => {
    if (onZeroSensor)
      onZeroSensor();
  };

  const handleSensorSelect = (evt:React.FormEvent<HTMLSelectElement>) => {
    if (onSensorSelect && (props.sensorSlot.slotIndex != null)) {
      const selectedColID = evt.currentTarget.value;
      onSensorSelect(props.sensorSlot.slotIndex, selectedColID);
    }
  };

  const sensorReading = () => {
    const sensorValue = sensor && sensor.sensorValue;
    if ((sensorValue == null) || isNaN(sensorValue))
      return "";

    const { sensorPrecision } = props,
          reading = Format.formatFixedValue(sensorValue - tareValue, sensorPrecision);
    return (sensorUnitStr) ? `${reading} ${sensorUnitStr}` : reading;
  };

  const sensorSelectOptions = (sensorColumns:ISensorConfigColumnInfo[]) => {
    const columns = sensorColumns || [];
    // if no sensor slot or not enough sensors, there are no options
    if ((sensorSlot.slotIndex == null) || (sensorSlot.slotIndex >= columns.length)) return null;
    return columns.map((column:ISensorConfigColumnInfo, index:number) => {
      const units = column && column.units,
            columnID = column && column.id,
            sensorDef = units && SensorDefinitions[units],
            measurementName = sensorDef && sensorDef.measurementName;
      if (!measurementName) return null;

      const measurementNameWithUnits = units
                                        ? `${measurementName} (${units}) [${index+1}]`
                                        : measurementName;
      return (<option key={units+String(index)} value={columnID}>{measurementNameWithUnits}</option>);
    });
  };

  const width = props.width && isFinite(props.width) ? props.width : null,
        style = width ? { width } : {},
        sensorOptions = sensorSelectOptions(props.sensorColumns),
        enableSensorSelect = sensorOptions && (sensorOptions.length > 1) && props.onSensorSelect,
        sensorDefinition = sensor && sensor.definition,
        enableZeroSensor = sensorDefinition && sensorDefinition.tareable && props.onZeroSensor;
  return (
    <div className="graph-side-panel" style={style}>
      <label className="reading-label side-panel-item">Reading:</label>
      <div className="sensor-reading-surround">
        <label className="sensor-reading side-panel-item">{sensorReading()}</label>
      </div>
      <label className="sensor-label side-panel-item">Sensor:</label>
      <Select className="sensor-select side-panel-item"
              value={sensor.columnID}
              disabled={!enableSensorSelect}
              onChange={handleSensorSelect} >
        {sensorOptions}
      </Select>
      <Button className="zero-button side-panel-item"
              onClick={handleZeroSensor} disabled={!enableZeroSensor}>
        Zero Sensor
      </Button>
    </div>
  );
};
