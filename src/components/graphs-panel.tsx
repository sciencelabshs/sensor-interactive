import * as React from "react";
import SensorGraph from "./sensor-graph";
import { withSize }  from "react-sizeme";
import { SensorRecording } from "../interactive/types";

interface ISizeMeSize {
  width:number|null;
  height:number|null;
}

interface IGraphsPanelProps {
  size:ISizeMeSize;
  sensorRecordings:SensorRecording[];
  preRecordings:SensorRecording[];
  onGraphZoom:(xStart:number, xEnd:number) => void;
  onSensorSelect:(sensorIndex:number, columnID:string) => void;
  xStart:number;
  xEnd:number;
  timeUnit:string;
  collecting:boolean;
  hasData:boolean;
  dataReset:boolean;
  assetsPath: string;
  secondGraph:boolean;
  maxHeight?: number;
  singleReads?: boolean;
}

const GraphsPanelImp: React.FC<IGraphsPanelProps> = (props) => {

  function renderGraph(options: {
    sensorRecording?:SensorRecording,
    preRecording?: SensorRecording,
    title:string,
    isSingletonGraph:boolean,
    isLastGraph:boolean}) {
    const {sensorRecording, preRecording, title, isSingletonGraph, isLastGraph} = options,
          height = props.maxHeight || props.size.height,
          availableHeight = height && (height - 20),
          singleGraphHeight = availableHeight && (availableHeight + 8),
          graphBaseHeight = availableHeight && Math.floor((availableHeight - 18) / 2),
          firstGraphHeight = graphBaseHeight,
          secondGraphHeight = availableHeight && graphBaseHeight && (availableHeight - graphBaseHeight),
          graphWidth = props.size.width && (props.size.width - 16),
          graphHeight = isSingletonGraph
                          ? singleGraphHeight
                          : isLastGraph ? secondGraphHeight : firstGraphHeight;
    return <SensorGraph width={graphWidth}
                        height={graphHeight}
                        sensorRecording={sensorRecording}
                        preRecording={preRecording}
                        title={title}
                        isSingletonGraph={isSingletonGraph}
                        isLastGraph={isLastGraph}
                        onGraphZoom={props.onGraphZoom}
                        onSensorSelect={props.onSensorSelect}
                        xStart={props.xStart}
                        xEnd={props.xEnd}
                        timeUnit={props.timeUnit}
                        collecting={props.collecting}
                        hasData={props.hasData}
                        dataReset={props.dataReset}
                        assetsPath={props.assetsPath}
                        singleReads={props.singleReads}
                        />;
  }

  const { sensorRecordings, preRecordings, secondGraph } = props,
        hasConnected = sensorRecordings.length > 0,
        showSecondGraph = secondGraph || (sensorRecordings.length > 1),
        classes = `graphs-panel ${showSecondGraph ? 'two-graphs' : ''} ${hasConnected ? '' : 'disabled'}`,
        style = { minHeight: showSecondGraph ? 320 : 170 };

  return (
      <div className={classes} style={style}>
        {renderGraph({sensorRecording: sensorRecordings[0], preRecording: preRecordings && preRecordings[0], title: "graph1", isSingletonGraph: !showSecondGraph, isLastGraph: !showSecondGraph})}
        {showSecondGraph
            ? renderGraph({sensorRecording: sensorRecordings[1], title: "graph2", isSingletonGraph: false, isLastGraph: true})
            : null}
      </div>
    );
};

const sizeMeConfig = {
  monitorWidth: true,
  monitorHeight: true,
  noPlaceholder: true
};

const GraphsPanel: React.FC<Omit<IGraphsPanelProps, "size">> = withSize(sizeMeConfig)(GraphsPanelImp);

export default GraphsPanel;
