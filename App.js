import React, { Component } from 'react';
import { StyleSheet, View, Button, Dimensions, Text, Platform } from 'react-native';
import {
  DangerZone, GestureHandler
} from 'expo';

const { Animated } = DangerZone;
const {
  PanGestureHandler,
  TapGestureHandler,
  State,
} = GestureHandler;


const { height } = Dimensions.get('window');

const P = (android, ios) => Platform.OS === 'ios' ? ios : android;

const magic = {
  damping: P(9, 7),
  mass: 0.3,
  stiffness: 121.6,
  overshootClamping: true,
  restSpeedThreshold: 0.1,
  restDisplacementThreshold: 0.1,
  deceleration: 0.999,
  bouncyFactor: 1,
  velocityFactor: P(1, 1.2),
  dampingForMaster: 50,
  tossForMaster: 0.4,
  coefForTranslatingVelocities: 5

}; // pls do it better

const {
  damping,
  dampingForMaster,
  mass,
  stiffness,
  overshootClamping,
  restSpeedThreshold,
  restDisplacementThreshold,
  deceleration,
  velocityFactor,
  tossForMaster
} = magic;


const { set, cond, onChange, block, eq, greaterOrEq, not, defined, max, add, and, Value, spring, or, divide, greaterThan, sub, event, diff, multiply, clockRunning, startClock, stopClock, decay, Clock, lessThan } = Animated;


function runDecay(clock, value, velocity, wasStartedFromBegin) {
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  };

  const config = { deceleration };

  return [
    cond(clockRunning(clock), 0, [
      cond(wasStartedFromBegin, 0, [
        set(wasStartedFromBegin, 1),
        set(state.finished, 0),
        set(state.velocity, multiply(velocity, velocityFactor)),
        set(state.position, value),
        set(state.time, 0),
        startClock(clock),
      ]),
    ]),
    cond(clockRunning(clock), decay(clock, state, config)),
    cond(state.finished, stopClock(clock)),
    state.position,
  ];
}


function withPreservingAdditiveOffset(drag, state) {
  const prev = new Animated.Value(0);
  const valWithPreservedOffset = new Animated.Value(0);
  return block([
    cond(eq(state, State.BEGAN), [
      set(prev, 0)
    ], [
      set(valWithPreservedOffset, add(valWithPreservedOffset, sub(drag, prev))),
      set(prev, drag),
    ]),
    valWithPreservedOffset
  ]);
}

function withDecaying(drag, state, decayClock, velocity, prevent) {
  const valDecayed = new Animated.Value(0);
  const offset = new Animated.Value(0);
  // since there might be moar than one clock
  const wasStartedFromBegin = new Animated.Value(0);
  return block([
    cond(eq(state, State.END),
      [
        cond(prevent,
          stopClock(decayClock),
          set(valDecayed, runDecay(decayClock, add(drag, offset), velocity, wasStartedFromBegin))
        )
      ],
      [
        stopClock(decayClock),
        cond(eq(state, State.BEGAN, set(prevent, 0))),
        cond(eq(state, State.BEGAN), [
          set(wasStartedFromBegin, 0),
          set(offset, add(sub(valDecayed, drag)))
        ]),
        set(valDecayed, add(drag, offset))
      ],
    ),
    valDecayed,
  ]);
}


function runSpring(clock, value, velocity, dest, damping = damping, wasRun = 0, isManuallySet = 0) {
  const state = {
    finished: new Value(0),
    velocity: new Value(0),
    position: new Value(0),
    time: new Value(0),
  };

  const config = {
    damping,
    mass,
    stiffness,
    overshootClamping,
    restSpeedThreshold,
    restDisplacementThreshold,
    toValue: new Value(0),
  };

  return [
    cond(clockRunning(clock), 0, [
      set(state.finished, 0),
      set(state.velocity, velocity),
      set(state.position, value),
      set(config.toValue, dest),
      cond(and(wasRun, not(isManuallySet)), 0, startClock(clock)),
      cond(defined(wasRun), set(wasRun, 1)),
    ]),
    spring(clock, state, config),
    cond(state.finished, stopClock(clock)),
    state.position,
  ];
}


export default class Example extends Component {
  static defaultProps = {
    snapPoints: [450, 300, 150, 0],
    initialSnap: 0,
  };

  decayClock = new Clock();
  panState = new Value(0);
  tapState = new Value(0);
  velocity = new Value(0);
  panMasterState = new Value(State.END);
  masterVelocity = new Value(0);
  isManuallySetValue = new Animated.Value(0);
  afterManuallySetValue = new Animated.Value(0);
  manuallySetValue = new Animated.Value(0);
  masterClockForOverscroll = new Clock();
  preventDecaying = new Animated.Value(0);
  dragMasterY = new Value(0);
  dragY = new Value(0);
  constructor(props) {
    super(props);
    this.state = Example.getDerivedStateFromProps(props);
    const { snapPoints } = this.state;
    const middlesOfSnapPoints = [];
    for (let i = 1; i < snapPoints.length; i++) {
      middlesOfSnapPoints.push(divide(add(snapPoints[i - 1] + snapPoints[i]), 2));
    }
    const masterOffseted = new Animated.Value(snapPoints[props.initialSnap]);
    // destination point is a approximation of movement if finger released
    const destinationPoint = add(masterOffseted, multiply(tossForMaster, this.masterVelocity),);
    // method for generating condition for finding the nearest snap point
    const currentSnapPoint = (i = 0) => i + 1 === snapPoints.length ?
      snapPoints[i] :
      cond(
        lessThan(destinationPoint, middlesOfSnapPoints[i]),
        snapPoints[i],
        currentSnapPoint(i + 1)
      );
    // current snap point desired
    this.snapPoint = currentSnapPoint();

    const masterClock = new Clock();
    const prevMasterDrag = new Animated.Value(0);
    const wasRun = new Animated.Value(0);
    this.translateMaster = block([
      cond(eq(this.panMasterState, State.END),
        [
          set(prevMasterDrag, 0),
          cond(or(clockRunning(masterClock), not(wasRun), this.isManuallySetValue),
            [
              cond(this.isManuallySetValue, stopClock(masterClock)),
              set(masterOffseted,
                runSpring(masterClock, masterOffseted, this.masterVelocity,
                  cond(this.isManuallySetValue, this.manuallySetValue, this.snapPoint),
                  dampingForMaster, wasRun, this.isManuallySetValue)
              ),
              set(this.isManuallySetValue, 0)
            ]
          ),
        ],
        [
          stopClock(masterClock),
          set(this.preventDecaying, 1),
          set(masterOffseted, add(masterOffseted, sub(this.dragMasterY, prevMasterDrag))),
          set(prevMasterDrag, this.dragMasterY),
          cond(eq(this.panMasterState, State.BEGAN),
            [
              stopClock(this.masterClockForOverscroll),
              set(wasRun, 0),
            ]
          ),
        ]
      ),
      max(masterOffseted, snapPoints[0])
    ]);

    this.Y = this.withEnhancedLimits(
      withDecaying(
        withPreservingAdditiveOffset(this.dragY, this.panState),
        this.panState,
        this.decayClock,
        this.velocity,
        this.preventDecaying),
      masterOffseted);
  }

  handleMasterPan = event([{ nativeEvent: ({
    translationY: this.dragMasterY,
    state: this.panMasterState,
    velocityY: this.masterVelocity
  })}]);

  handlePan = event([{ nativeEvent: ({
    translationY: this.dragY,
    state: this.panState,
    velocityY: this.velocity
  })}]);

  handleTap = event([{ nativeEvent: { state: this.tapState } }]);

  withEnhancedLimits(val, masterOffseted) {
    const wasRunMaster = new Animated.Value(0)
    const min = multiply(-1, add(this.state.heightOfContent, this.state.heightOfHeaderAnimated))
    const prev = new Animated.Value(0);
    const limitedVal = new Animated.Value(0);
    const diffPres = new Animated.Value(0);
    const flagWasRunSpring = new Animated.Value(0);
    const justEndedIfEnded = new Animated.Value(1);
    const rev = new Animated.Value(0);
    return block([
      set(rev, limitedVal),
      cond(eq(this.panState, State.BEGAN), [
        set(prev, val),
        set(flagWasRunSpring, 0),
        stopClock(this.masterClockForOverscroll),
        set(wasRunMaster, 0),
      ], [
        set(limitedVal, add(limitedVal, sub(val, prev))),
        cond(lessThan(limitedVal, min), set(limitedVal, min)),
      ]),
      set(diffPres, sub(prev, val)),
      set(prev, val),
      cond(or(greaterOrEq(limitedVal, 0),
        greaterThan(masterOffseted, 0))
        , [
          cond(eq(this.panState, State.ACTIVE),
            set(masterOffseted, sub(masterOffseted, diffPres)),
          ),
          cond(greaterThan(masterOffseted, 0), [
            set(limitedVal, 0)
          ]),
          cond(not(eq(this.panState, State.END)), set(justEndedIfEnded, 1)),
          cond(and(eq(this.panState, State.END), not(eq(this.panMasterState, State.ACTIVE)), not(eq(this.panMasterState, State.BEGAN)), or(clockRunning(this.masterClockForOverscroll), not(wasRunMaster))), [
            cond(justEndedIfEnded, set(this.masterVelocity, diff(val))),
            set(masterOffseted, runSpring(this.masterClockForOverscroll, masterOffseted, diff(val), this.snapPoint, dampingForMaster, wasRunMaster)),
            cond(justEndedIfEnded, set(this.masterVelocity, 0))
          ]),
          cond(eq(this.panState, State.END), set(justEndedIfEnded, 0)),
          set(this.preventDecaying, 1),
          0
        ], [
          set(this.preventDecaying, 0),
          limitedVal
        ])
    ]);
  }

  panRef = React.createRef();

  snapTo = index => {
    this.manuallySetValue.setValue(this.state.snapPoints[index])
    this.isManuallySetValue.setValue(1);
  }

  renderInner = () => (
    <React.Fragment>
      {[...Array(60)].map((e, i) => (
        <View key={i} style={{ height: 40, backgroundColor: `#${i % 10}88424` }}>
          <Text>
            computed
          </Text>
        </View>
      ))}
    </React.Fragment>
  );

  handleLayoutHeader = ({
                          nativeEvent: {
                            layout: {
                              height: heightOfHeader
                            }
                          }
                        }) => {
    this.state.heightOfHeaderAnimated.setValue(heightOfHeader);
    this.setState({ heightOfHeader });
  };

  handleLayoutContent = ({
                           nativeEvent: {
                             layout: {
                               height
                             }
                           }
                         }) => this.state.heightOfContent.setValue(height - this.props.snapPoints[0]);


  static getDerivedStateFromProps(props, state) {
    return {
      heightOfHeaderAnimated: (state && state.heightOfHeaderAnimated) || new Animated.Value(0),
      heightOfContent: (state && state.heightOfContent) || new Animated.Value(0),
      initSnap: height - props.snapPoints[0],
      snapPoints: props.snapPoints.map(p => props.snapPoints[0] - p)
    };
  }

  master = React.createRef();

  render() {
    return (
      <View style={styles.container}>
        <Button
          onPress={() => this.snapTo(0)}
          title="0"
        />
        <Button
          onPress={() => this.snapTo(1)}
          title="1"
        />
        <Button
          onPress={() => this.snapTo(2)}
          style={{
            zIndex: 0
          }}
          title="2"
        />
        <Button
          onPress={() => this.snapTo(3)}
          title="3"
        />
        <View style={{ height: 400, width: 100, backgroundColor: 'blue', overflow: 'hidden' }}/>
        <Animated.View style={{
          width: '100%',
          overflow: 'hidden',
          position: 'absolute',
          zIndex: 100,
          transform: [
            {
              translateY: this.translateMaster
            },
            {
              translateY: this.state.initSnap
            }
          ]
        }}>
          <PanGestureHandler
            ref={this.master}
            waitFor={this.panRef}
            onGestureEvent={this.handleMasterPan}
            onHandlerStateChange={this.handleMasterPan}
          >
            <Animated.View
              style={{
                zIndex: 101
              }}
              onLayout={this.handleLayoutHeader}
            >
              <View style={{
                height: 40,
                backgroundColor: 'red'
              }}>
                <Text>
                  123
                </Text>
              </View>
            </Animated.View>
          </PanGestureHandler>
          <View
            style={{
              height: this.props.snapPoints[0] - this.state.heightOfHeader,
              backgroundColor: 'blue',
            }}
          >

            <PanGestureHandler
              waitFor={this.master}
              ref={this.panRef}
              onGestureEvent={this.handlePan}
              onHandlerStateChange={this.handlePan}
            >
              <Animated.View>
                <TapGestureHandler
                  onHandlerStateChange={this.handleTap}
                >
                  <Animated.View
                    style={{
                      width: '100%',
                      transform: [
                        { translateY: this.Y }
                      ]
                    }}
                    onLayout={this.handleLayoutContent}
                  >
                    {this.renderInner()}
                  </Animated.View>
                </TapGestureHandler>
              </Animated.View>
            </PanGestureHandler>
            <Animated.Code
              exec={onChange(this.tapState, cond(eq(this.tapState, State.BEGAN), stopClock(this.decayClock)))}/>
          </View>
        </Animated.View>
      </View>
    );
  }
}

const IMAGE_SIZE = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  box: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
});

