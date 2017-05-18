import * as React from "react";
import * as ReactModal from 'react-modal';
import { Title } from "./title";
import { Sensor } from "./sensor";
import { SensorGraph } from "./sensor-graph";
import { Codap } from "./codap";
import { SensorStrings, SensorDefinitions } from "./sensor-definitions";
import SensorConnectorInterface from "@concord-consortium/sensor-connector-interface";

const SENSOR_IP = "http://127.0.0.1:11180";

export interface AppProps {};

export interface AppState {
    sensorType:string,
    hasData:boolean,
    dataChanged:boolean,
    dataReset:boolean,
    collecting:boolean,
    runLength:number,
    timeUnit:string,
    warnNewModal:boolean,
    statusMessage:string|undefined,
    secondGraph:boolean
}

export class App extends React.Component<AppProps, AppState> {
    
    private sensorConnector:SensorConnectorInterface;
    private sensor1:Sensor;
    private sensor2:Sensor;
    private lastDataIndex:number;
    private codap:Codap;
    private selectionRange:{start:number,end:number|undefined} = {start:0,end:undefined};
    private stopTimer:number;
    private disableWarning:boolean = false;
    private valueUnits:string[];
    private sensorDataByType:any;
    
    constructor(props: AppProps) {
        super(props);
        this.state = {
            sensorType:"",
            hasData:false,
            dataChanged:false,
            dataReset:false,
            collecting:false,
            runLength:10,
            timeUnit:"",
            warnNewModal:false,
            statusMessage:undefined,
            secondGraph:false
        };
        
        this.sensor1 = new Sensor();
        this.sensor2 = new Sensor();
        
        this.codap = new Codap();
        this.valueUnits = [];
        this.sensorDataByType = {};
        
        this.onSensorConnect = this.onSensorConnect.bind(this);
        this.onSensorData = this.onSensorData.bind(this);
        this.onSensorDisconnect = this.onSensorDisconnect.bind(this);
        
        this.sensorConnector = new SensorConnectorInterface();
        this.sensorConnector.on("*", this.onSensorConnect);
        this.sensorConnector.startPolling(SENSOR_IP);
        
        this.onTimeSelect = this.onTimeSelect.bind(this);
        this.onGraphZoom = this.onGraphZoom.bind(this);
        this.startSensor = this.startSensor.bind(this);
        this.stopSensor = this.stopSensor.bind(this);
        this.sendData = this.sendData.bind(this);
        this.checkNewData = this.checkNewData.bind(this);
        this.closeWarnNewModal = this.closeWarnNewModal.bind(this);
        this.discardData = this.discardData.bind(this);
        this.toggleWarning = this.toggleWarning.bind(this);
        this.toggleGraph = this.toggleGraph.bind(this);
        this.reload = this.reload.bind(this);
    }
    
    onSensorConnect(e) {
        var sensorInfo = this.sensorConnector.stateMachine.currentActionArgs[1];
        var sensorType = sensorInfo.currentInterface;
        
        if(sensorType == "None Found") {
            this.setState({
                statusMessage: SensorStrings["messages"]["no_sensors"]
            });
        }
        else {
            this.sensorConnector.off("*", this.onSensorConnect);
            console.log("sensor connected: " + sensorType);
            
            var timeUnit;
            this.valueUnits = [];
            for(var setID in sensorInfo.columns) {
                var set = sensorInfo.columns[setID];
                if(set.name == "Time") {
                    timeUnit = set.units;
                } else if(this.valueUnits.indexOf(set.units) == -1) {
                    this.valueUnits.push(set.units);
                }
            }
            
            this.sensor1.valueUnit = this.valueUnits[0];
            this.sensor1.definition = SensorDefinitions[this.valueUnits[0]];
            if(this.valueUnits.length > 1) {
                this.sensor2.valueUnit = this.valueUnits[1];
                this.sensor2.definition = SensorDefinitions[this.valueUnits[1]];
            }
            
            this.setState({
                sensorType: sensorType,
                timeUnit: timeUnit
            });

            this.sensorConnector.on("data", this.onSensorData);
            this.sensorConnector.on("interfaceRemoved", this.onSensorDisconnect);
        }
    }
    
    sensorHasData():boolean {
        return (this.sensorConnector && this.sensorConnector.datasets[0] && this.sensorConnector.datasets[0].columns[1]);
    }
    
    startSensor() {
        this.sensorConnector.requestStart();
        this.setState({
            statusMessage: SensorStrings["messages"]["starting_data_collection"]
        });
    }
    
    stopSensor() {
        this.sensorConnector.requestStop();
        this.setState({
            collecting: false,
            statusMessage: SensorStrings["messages"]["data_collection_stopped"]
        });
        clearTimeout(this.stopTimer);
    }
    
    onSensorData(setId:string) {
        if(!this.state.collecting) {
            this.setState({
                hasData: true,
                dataChanged: true,
                collecting: true,
                statusMessage: SensorStrings["messages"]["collecting_data"]
            });

            this.stopTimer = setTimeout(()=>{
                this.stopSensor();
            }, this.state.runLength * 1000);
        }
    }
        
    onSensorDisconnect() {
        this.setState({
            statusMessage: SensorStrings["messages"]["disconnected"] 
        });
    }
    
    sendData() {
        var data1 = this.sensor1.sensorData.slice();
        data1 = data1.slice(this.selectionRange.start, this.selectionRange.end);
        
        if(!this.state.secondGraph) {
            this.codap.sendData(data1, this.sensor1.definition.measurementName);   
        } else {
            var data2 = this.sensor2.sensorData.slice();
            data2 = data2.slice(this.selectionRange.start, this.selectionRange.end);
            
            this.codap.sendDualData(data1, this.sensor1.definition.measurementName, 
                                data2, this.sensor2.definition.measurementName);
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
        this.sensorDataByType = {};
    }    
    
    onTimeSelect(event:React.FormEvent<HTMLSelectElement>) {
        this.setState({runLength:parseInt(event.currentTarget.value,10)});
    }
    
    onGraphZoom(xStart:number, xEnd:number) {
        
        // convert from time value to index
        //TODO: update to handle multiple graphs
        /*
        var i:number, entry:number[], nextEntry:number[];
        for(i=0; i < this.state.sensor1.data.length-1; i++) {
            entry = this.state.sensor1.data[i];
            nextEntry = this.state.sensor1.data[i+1];
            if(entry[0] == xStart) {
                this.selectionRange.start = i;
                break;
            } else if(entry[0] < xStart && nextEntry[0] >= xStart) {
                this.selectionRange.start = i+1;
                break;
            }
        }
        for(i; i < this.state.sensor1.data.length-1; i++) {
            entry = this.state.sensor1.data[i];
            nextEntry = this.state.sensor1.data[i+1];
            if(entry[0] == xEnd) {
                this.selectionRange.end = i;
                break;
            } else if(entry[0] < xEnd && nextEntry[0] >= xEnd) {
                this.selectionRange.end = i+1;
                break;
            }
        }
        */
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
    
    componentDidUpdate(prevProps, prevState) {
        if(!prevState.dataReset && this.state.dataReset) {
            this.setState({
                dataReset:false
            });
        }
    }
    
    renderGraph(sensor:Sensor, title:string) {
        return <SensorGraph sensor={sensor}
            title={title} 
            sensorConnector={this.sensorConnector}
            onGraphZoom={this.onGraphZoom} 
            runLength={this.state.runLength}
            valueUnits={this.valueUnits}
            collecting={this.state.collecting}
            dataReset={this.state.dataReset}/>;
    }
    
    renderControls() {
        return <div>
            <select id="timeSelect" onChange={ this.onTimeSelect } defaultValue="10">
                <option value="1">{"1.0" + this.state.timeUnit}</option>
                <option value="5">{"5.0" + this.state.timeUnit}</option>
                <option value="10">{"10.0" + this.state.timeUnit}</option>
                <option value="15">{"15.0" + this.state.timeUnit}</option>
                <option value="20">{"20.0" + this.state.timeUnit}</option>
                <option value="30">{"30.0" + this.state.timeUnit}</option>
                <option value="45">{"45.0" + this.state.timeUnit}</option>
                <option value="60">{"60.0" + this.state.timeUnit}</option>
            </select>
            <button id="startSensor" 
                onClick={this.startSensor}
                disabled={this.state.collecting}>Start</button>
            <button id="stopSensor" 
                onClick={this.stopSensor}
                disabled={!this.state.collecting}>Stop</button>
            <button id="sendData" 
                onClick={this.sendData} 
                disabled={!(this.state.hasData && this.state.dataChanged) || this.state.collecting}>Save Data</button>
            <button id="newData" 
                onClick={this.checkNewData} 
                disabled={!this.state.hasData || this.state.collecting}>New Run</button>
            </div>
    }

    render() {
        return (
            <div>
                <ReactModal contentLabel="Discard data?" 
                    isOpen={this.state.warnNewModal}
                    style={{
                        content: {
                            bottom: "auto"
                        }
                    }}>
                    <p>Pressing New Run without pressing Save Data will discard the current data. Set up a new run without saving the data first?</p>
                    <input type="checkbox" 
                        onChange={this.toggleWarning}/><label>Don't show this message again</label>
                    <hr></hr>
                    <button 
                        onClick={this.closeWarnNewModal}>Go back</button>
                    <button
                        onClick={this.discardData}>Discard the data</button>
                </ReactModal>
                <div>
                    <button
                        onClick={this.reload}>Reload</button>
                    <Title sensorType={this.state.sensorType}/>
                    <div>
                        <button id="toggleGraphBtn"
                             onClick={this.toggleGraph}>
                            {this.state.secondGraph ? "Remove Graph" : "Add Graph"}</button>
                    </div>
                </div>
                <div>{this.state.statusMessage}</div>
                {this.renderGraph(this.sensor1, "graph1")}
                {this.state.secondGraph ? this.renderGraph(this.sensor2, "graph2"): null}
                {this.renderControls()}
            </div>
        );
    }
    
}