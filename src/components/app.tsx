import * as React from "react";
import ReactModal from "react-modal";
import { Sensor } from "../models/sensor";
import { SensorSlot } from "../models/sensor-slot";
import { SensorConfiguration } from "../models/sensor-configuration";
import { ISensorConfig, ISensorConfigColumnInfo } from "../models/sensor-connector-interface";
import { SensorGraph } from "./sensor-graph";
import { ControlPanel } from "./control-panel";
import { Codap } from "../models/codap";
import { IStringMap, SensorStrings, SensorDefinitions } from "../models/sensor-definitions";
import SensorConnectorInterface from "@concord-consortium/sensor-connector-interface";
import SmartFocusHighlight from "../utils/smart-focus-highlight";
import { find, pull } from "lodash";

const SENSOR_IP = "http://127.0.0.1:11180";

export interface AppProps {}

export interface AppState {
    sensorConfig:SensorConfiguration | null;
    sensorSlots:SensorSlot[];
    hasData:boolean;
    dataChanged:boolean;
    dataReset:boolean;
    collecting:boolean;
    runLength:number;
    timeUnit:string;
    warnNewModal:boolean;
    reconnectModal:boolean;
    statusMessage:string|undefined;
    secondGraph:boolean;
    xStart:number;
    xEnd:number;
}

function newSensorFromDataColumn(dataColumn:ISensorConfigColumnInfo) {
    let newSensor = new Sensor();
    newSensor.columnID = dataColumn.id;
    newSensor.sensorPosition = dataColumn.position;
    newSensor.valueUnit = dataColumn.units;
    newSensor.definition = SensorDefinitions[dataColumn.units];
    return newSensor;
}

function matchSensorsToDataColumns(slots:SensorSlot[], dataColumns:ISensorConfigColumnInfo[]) {
    let matched:Array<Sensor|null> = [null, null],
        columns = dataColumns.slice();
    
    function matchSensors(test: (c:ISensorConfigColumnInfo, s:Sensor) => boolean) {
        matched.forEach((sensor:Sensor|null, index) => {
            let found;
            if (!matched[index]) {
                found = find(columns, (c) => test(c, slots[index].sensor));
                if (found) {
                    matched[index] = newSensorFromDataColumn(found);
                    // remove matched column so it can't be matched again
                    pull(columns, found);
                }
            }
        });
        return matched[0] && matched[1];
    }

    function findBestSensorMatch() {
        // match by column ID
        if (matchSensors((c:ISensorConfigColumnInfo, s:Sensor) => c.id === s.columnID)) return;
        // match by sensor position (as long as units are compatible)
        if (matchSensors((c:ISensorConfigColumnInfo, s:Sensor) =>
                        (c.position === s.sensorPosition) && (c.units === s.valueUnit))) return;
        // match by units (independent of position)
        if (matchSensors((c:ISensorConfigColumnInfo, s:Sensor) => c.units === s.valueUnit)) return;
        // match by position (independent of units)
        if (matchSensors((c:ISensorConfigColumnInfo, s:Sensor) => c.position === s.sensorPosition)) return;
        // last resort - match whatever's available
        if (matchSensors((c:ISensorConfigColumnInfo, s:Sensor) => true)) return;
    }

    findBestSensorMatch();

    // update slots with matched sensors; clear unmatched sensors
    matched.forEach((s:Sensor|null, i) => {
        slots[i].setSensor(s || new Sensor());
    });
    return slots;
}

export class App extends React.Component<AppProps, AppState> {
    
    private messages:IStringMap;
    private sensorConnector:any;
    private lastDataIndex:number;
    private lastTime:number;
    private codap:Codap;
    private selectionRange:{start:number,end:number|undefined} = {start:0,end:undefined};
    private disableWarning:boolean = false;
    
    constructor(props: AppProps) {
        super(props);
        
        this.state = {
            sensorConfig:null,
            sensorSlots:[new SensorSlot(0, new Sensor()), new SensorSlot(1, new Sensor())],
            hasData:false,
            dataChanged:false,
            dataReset:false,
            collecting:false,
            runLength:10,
            xStart:0,
            xEnd:10.01, // without the .01, last tick number sometimes fails to display
            timeUnit:"",
            warnNewModal:false,
            reconnectModal:false,
            statusMessage:undefined,
            secondGraph:false
        };
        
        this.messages = SensorStrings.messages as IStringMap;
        this.connectCodap = this.connectCodap.bind(this);
        this.onSensorConnect = this.onSensorConnect.bind(this);
        this.onSensorData = this.onSensorData.bind(this);
        this.onSensorCollectionStopped = this.onSensorCollectionStopped.bind(this);
        this.onSensorDisconnect = this.onSensorDisconnect.bind(this);
        
        setTimeout(this.connectCodap, 1000);
        this.sensorConnector = new SensorConnectorInterface();
        this.sensorConnector.on("datasetAdded", this.onSensorConnect);
        this.sensorConnector.on("interfaceConnected", this.onSensorConnect);
        this.sensorConnector.on("columnAdded", this.onSensorConnect);
        this.sensorConnector.on("columnMoved", this.onSensorConnect);
        this.sensorConnector.on("columnRemoved", this.onSensorConnect);
        this.sensorConnector.startPolling(SENSOR_IP);
        
        this.onTimeSelect = this.onTimeSelect.bind(this);
        this.onGraphZoom = this.onGraphZoom.bind(this);
        this.startSensor = this.startSensor.bind(this);
        this.stopSensor = this.stopSensor.bind(this);
        this.sendData = this.sendData.bind(this);
        this.checkNewData = this.checkNewData.bind(this);
        this.closeWarnNewModal = this.closeWarnNewModal.bind(this);
        this.tryReconnectModal = this.tryReconnectModal.bind(this);
        this.discardData = this.discardData.bind(this);
        this.toggleWarning = this.toggleWarning.bind(this);
        this.toggleGraph = this.toggleGraph.bind(this);
        this.reload = this.reload.bind(this);
    }

    componentDidMount() {
        SmartFocusHighlight.enableFocusHighlightOnKeyDown();
    }
    
    connectCodap() {
        this.codap = new Codap();
    }
    
    onSensorConnect() {
        const config:ISensorConfig = this.sensorConnector.stateMachine.currentActionArgs[1],
              sensorConfig = new SensorConfiguration(config),
              interfaceType = sensorConfig.interface;
        
        if(!sensorConfig.hasInterface) {
            this.setState({
                sensorConfig: null,
                statusMessage: this.messages["no_sensors"]
            });
        }
        else {
            this.sensorConnector.off("*", this.onSensorConnect);
            console.log("interface connected: " + interfaceType);
            
            this.setState({
                statusMessage: ""
            });
            
            const timeUnit = sensorConfig.timeUnit || "",
                  dataColumns = sensorConfig.dataColumns,
                  sensorSlots = matchSensorsToDataColumns(this.state.sensorSlots, dataColumns) as SensorSlot[];
            
            this.setState({ sensorConfig, sensorSlots, timeUnit });

            this.sensorConnector.on("data", this.onSensorData);
            this.sensorConnector.on("interfaceRemoved", this.onSensorDisconnect);
            this.sensorConnector.on("columnAdded", this.onSensorConnect);
            this.sensorConnector.on("columnMoved", this.onSensorConnect);
            this.sensorConnector.on("columnRemoved", this.onSensorConnect);
        }
    }
    
    handleSensorSelect = (sensorIndex:number, columnID:string) => {
        let { sensorSlots } = this.state,
            sensors = sensorSlots.map((slot) => slot.sensor);
        // if same sensor selected, there's nothing to do
        if (sensorSlots[sensorIndex].sensor.columnID === columnID) return;
        // if the other graphed sensor is selected, just switch them
        const otherIndex = 1 - sensorIndex;
        if (sensors[otherIndex].columnID === columnID) {
            sensorSlots.forEach((slot, i) => { slot.sensor = sensors[1-i]; });
        }
        // if a third sensor is selected, configure the new sensor
        else {
            const sensorConfig = this.state.sensorConfig,
                  dataColumn = sensorConfig && sensorConfig.getColumnByID(columnID),
                  newSensor = dataColumn
                                ? newSensorFromDataColumn(dataColumn)
                                : new Sensor();
            sensorSlots[sensorIndex].setSensor(newSensor);
        }
        this.setState({ sensorSlots });
    }
    
    sensorHasData():boolean {
        return (this.sensorConnector &&
                    this.sensorConnector.datasets[0] &&
                    this.sensorConnector.datasets[0].columns[1]);
    }
    
    startSensor() {
        this.sensorConnector.requestStart();
        this.setState({
            statusMessage: this.messages["starting_data_collection"]
        });
    }
    
    stopSensor() {
        this.sensorConnector.requestStop();
        this.lastTime = 0;
    }
    
    onSensorCollectionStopped() {
        this.setState({
            collecting: false,
            statusMessage: this.messages["data_collection_stopped"]
        });
        
        this.sensorConnector.off("collectionStopped", this.onSensorCollectionStopped);
    }
    
    onSensorData(setId:string) {
        if(!this.state.collecting) {
            this.setState({
                hasData: true,
                dataChanged: true,
                collecting: true,
                statusMessage: this.messages["collecting_data"]
            });
        
            this.sensorConnector.on("collectionStopped", this.onSensorCollectionStopped);
        }
        
        var sensorInfo = this.sensorConnector.stateMachine.currentActionArgs;
        var setID = sensorInfo[1];
        // set IDs ending in 0 contain time data
        if(setID.slice(setID.length-1) === 0) {
            var timeData = sensorInfo[2];
            // make sure the sensor graph has received the update for the final value
            if(this.lastTime && this.lastTime > this.state.runLength) {
                this.stopSensor();
            } else {
                this.lastTime = timeData[timeData.length-1];
            }
        }
    }
        
    onSensorDisconnect() {
        this.setState({
            reconnectModal: true,
            sensorConfig: null
        });
    }
    
    sendData() {
        const { sensorSlots, secondGraph } = this.state,
              data = sensorSlots.map((slot) =>
                        slot.sensorData.slice(this.selectionRange.start, this.selectionRange.end)),
              sendSecondSensorData = secondGraph && sensorSlots[1].isConnected;
        let names = sensorSlots.map((slot) => slot.sensor.definition.measurementName);
        if (!sendSecondSensorData) {
            this.codap.sendData(data[0], names[0]);   
        }
        else {
            names = names.map((name, index) => `${name}_${index+1}`);
            this.codap.sendDualData(data[0], names[0], data[1], names[1]);
        }
        
        this.setState({
            dataChanged: false
        });
    }
    
    checkNewData() {
        if(this.state.dataChanged && !this.disableWarning) {
            this.setState({
               warnNewModal: true
            });
        } else {
            this.newData();
        }
    }
    
    newData() {
        this.setState({
            hasData:false,
            dataReset:true,
            dataChanged:false
        });
        this.lastDataIndex = 0;
    }    
    
    onTimeSelect(newTime:number) {
        this.setState({
            runLength: newTime,
            xStart: 0,
            // without the .01, last tick number sometimes fails to display
            xEnd: newTime + 0.01
        });
    }
    
    onGraphZoom(xStart:number, xEnd:number) {
        const sensor1Data = this.state.sensorSlots[0].sensorData;
        
        // convert from time value to index
        var i:number, entry:number[], nextEntry:number[];
        for(i=0; i < sensor1Data.length-1; i++) {
            entry = sensor1Data[i];
            nextEntry = sensor1Data[i+1];
            if(entry[0] === xStart) {
                this.selectionRange.start = i;
                break;
            } else if(entry[0] < xStart && nextEntry[0] >= xStart) {
                this.selectionRange.start = i+1;
                break;
            }
        }
        for(i; i < sensor1Data.length-1; i++) {
            entry = sensor1Data[i];
            nextEntry = sensor1Data[i+1];
            if(entry[0] === xEnd) {
                this.selectionRange.end = i;
                break;
            } else if(entry[0] < xEnd && nextEntry[0] >= xEnd) {
                this.selectionRange.end = i+1;
                break;
            }
        }
        
        this.setState({
            xStart: xStart,
            xEnd: xEnd,
            dataChanged: true
        });
    }

    closeWarnNewModal() {
        this.setState({
            warnNewModal: false
        });
    }
        
    discardData() {
        this.closeWarnNewModal();
        this.newData();
    }
    
    tryReconnectModal() {
        this.setState({
            reconnectModal: false
        });
        this.onSensorConnect();
    }
    
    toggleWarning() {
        this.disableWarning = true;
    }
    
    toggleGraph() {
        this.setState({
            secondGraph: !this.state.secondGraph
        });
    }
    
    reload() {
        location.reload();
    }
    
    componentDidUpdate(prevProps:AppProps, prevState:AppState) {
        if(!prevState.dataReset && this.state.dataReset) {
            this.setState({
                dataReset:false
            });
        }
    }
    
    renderGraph(sensorSlot:SensorSlot, title:string, isSingletonGraph:boolean, isLastGraph:boolean = isSingletonGraph) {
        const sensorColumns = this.state.sensorConfig && this.state.sensorConfig.dataColumns;
        return <SensorGraph sensorSlot={sensorSlot}
                            title={title} 
                            sensorConnector={this.sensorConnector}
                            onGraphZoom={this.onGraphZoom} 
                            onSensorSelect={this.handleSensorSelect}
                            onStopCollection={this.stopSensor}
                            runLength={this.state.runLength}
                            xStart={this.state.xStart}
                            xEnd={this.state.xEnd}
                            isSingletonGraph={isSingletonGraph}
                            isLastGraph={isLastGraph}
                            sensorColumns={sensorColumns}
                            collecting={this.state.collecting}
                            dataReset={this.state.dataReset}/>;
    }
    
    render() {
        var { sensorConfig, sensorSlots, secondGraph } = this.state,
            codapURL = window.self === window.top
                        ? "http://codap.concord.org/releases/latest?di=" + window.location.href
                        : "",
            interfaceType = (sensorConfig && sensorConfig.interface) || "";
        return (
            <div>
                <ReactModal contentLabel="Discard data?" 
                    isOpen={this.state.warnNewModal}
                    style={{
                        content: {
                            bottom: "auto"
                        }
                    }}>
                    <p>{this.messages["check_save"]}</p>
                    <input type="checkbox" 
                        onChange={this.toggleWarning}/><label>Don't show this message again</label>
                    <hr/>
                    <button 
                        onClick={this.closeWarnNewModal}>Go back</button>
                    <button
                        onClick={this.discardData}>Discard the data</button>
                </ReactModal>
                <ReactModal contentLabel="Sensor not attached" 
                    isOpen={this.state.reconnectModal}
                    style={{
                        content: {
                            bottom: "auto"
                        }
                    }}>
                    <p>{this.messages["sensor_not_attached"]}</p>
                    
                    <hr/>
                    <button 
                        onClick={this.tryReconnectModal}>Try again</button>
                </ReactModal>
                <div className="app-top-bar">
                    <label className="two-sensors-checkbox">
                        <input type="checkbox" 
                            id="toggleGraphBtn"
                            onClick={this.toggleGraph} />
                        Two sensors
                    </label>
                    <div>{this.state.statusMessage || "\xA0"}</div>
                </div>
                {this.renderGraph(sensorSlots[0], "graph1", !secondGraph)}
                {secondGraph
                    ? this.renderGraph(sensorSlots[1], "graph2", false, true)
                    : null}
                <ControlPanel   interfaceType={interfaceType}
                                collecting={this.state.collecting}
                                hasData={this.state.hasData}
                                dataChanged={this.state.dataChanged}
                                duration={10} durationUnit="s"
                                durationOptions={[1, 5, 10, 15, 20, 30, 45, 60]}
                                embedInCodapUrl={codapURL}
                                onDurationChange={this.onTimeSelect}
                                onStartCollecting={this.startSensor}
                                onStopCollecting={this.stopSensor}
                                onNewRun={this.checkNewData}
                                onSaveData={this.sendData}
                                onReloadPage={this.reload}
                />
            </div>
        );
    }
    
}
