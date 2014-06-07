var color_wheel = {
    Reds: {
        1: ['#FF0000'],
        2: ['#FF0000', '#BF3030'],
        3: ['#FF0000', '#BF3030', '#A60000'],
        4: ['#FF0000', '#BF3030', '#A60000', '#FF4040'],
        5: ['#FF0000', '#BF3030', '#A60000', '#FF4040', '#FF7373']
    }
    ,Oranges: {
        1: ['#FF7400'],
        2: ['#FF7400', '#BF6F30'],
        3: ['#FF7400', '#BF6F30', '#A64A00'],
        4: ['#FF7400', '#BF6F30', '#A64A00', '#FF9540'],
        5: ['#FF7400', '#BF6F30', '#A64A00', '#FF9540', '#FFB173']
    }
    ,OrangeYellows: {
        1: ['#FFA900'],
        2: ['#FFA900', '#BF8F30'],
        3: ['#FFA900', '#BF8F30', '#A66E00'],
        4: ['#FFA900', '#BF8F30', '#A66E00', '#FFBE40'],
        5: ['#FFA900', '#BF8F30', '#A66E00', '#FFBE40', '#FFCF73']
    }
    ,Yellows: {
        1: ['#FFE800'],
        2: ['#FFE800', '#BFB230'],
        3: ['#FFE800', '#BFB230', '#A69700'],
        4: ['#FFE800', '#BFB230', '#A69700', '#FFEE40'],
        5: ['#FFE800', '#BFB230', '#A69700', '#FFEE40', '#FFF273']
    }
    ,YellowGreens: {
        1: ['#CFF700'],
        2: ['#CFF700', '#A3B92E'],
        3: ['#CFF700', '#A3B92E', '#87A000'],
        4: ['#CFF700', '#A3B92E', '#87A000', '#DDFB3F'],
        5: ['#CFF700', '#A3B92E', '#87A000', '#DDFB3F', '#E5FB71']
    }
    ,Greens: {
        1: ['#62E200'],
        2: ['#62E200', '#62AA2A'],
        3: ['#62E200', '#62AA2A', '#409300'],
        4: ['#62E200', '#62AA2A', '#409300', '#8BF13C'],
        5: ['#62E200', '#62AA2A', '#409300', '#8BF13C', '#A6F16C']
    }
    ,BlueGreens: {
        1: ['#00AE68'],
        2: ['#00AE68', '#21825B'],
        3: ['#00AE68', '#21825B', '#007143'],
        4: ['#00AE68', '#21825B', '#007143', '#36D695'],
        5: ['#00AE68', '#21825B', '#007143', '#36D695', '#60D6A7']
    }
    ,LtBlues: {
        1: ['#0B61A4'],
        2: ['#0B61A4', '#25567B'],
        3: ['#0B61A4', '#25567B', '#033E6B'],
        4: ['#0B61A4', '#25567B', '#033E6B', '#3F92D2'],
        5: ['#0B61A4', '#25567B', '#033E6B', '#3F92D2', '#66A3D2']
    }
    ,Blues: {
        1: ['#1B1BB3'],
        2: ['#1B1BB3', '#313186'],
        3: ['#1B1BB3', '#313186', '#090974'],
        4: ['#1B1BB3', '#313186', '#090974', '#4F4FD9'],
        5: ['#1B1BB3', '#313186', '#090974', '#4F4FD9', '#7373D9']
    }
    ,Violets: {
        1: ['#530FAD'],
        2: ['#530FAD', '#4F2982'],
        3: ['#530FAD', '#4F2982', '#330570'],
        4: ['#530FAD', '#4F2982', '#330570', '#8243D6'],
        5: ['#530FAD', '#4F2982', '#330570', '#8243D6', '#996AD6']
    }
    ,Magentas: {
        1: ['#AD009F'],
        2: ['#AD009F', '#82217A'],
        3: ['#AD009F', '#82217A', '#710067'],
        4: ['#AD009F', '#82217A', '#710067', '#D636C9'],
        5: ['#AD009F', '#82217A', '#710067', '#D636C9', '#D660CC']
    }
    ,CoolReds: {
        1: ['#E20048'],
        2: ['#E20048', '#AA2A53'],
        3: ['#E20048', '#AA2A53', '#93002F'],
        4: ['#E20048', '#AA2A53', '#93002F', '#F13C76'],
        5: ['#E20048', '#AA2A53', '#93002F', '#F13C76', '#F16C97']
    }
};

color_wheel.Wheel = [];

color_wheel.Wheel[1] = color_wheel.Blues[1].concat(
    color_wheel.Reds[1],
    color_wheel.Oranges[1],
    color_wheel.BlueGreens[1],
    color_wheel.Magentas[1],
    color_wheel.OrangeYellows[1],
    color_wheel.Greens[1],
    color_wheel.LtBlues[1]
);

color_wheel.Wheel[2] = color_wheel.Wheel[1].concat(
    color_wheel.Blues[2][1],
    color_wheel.Reds[2][1],
    color_wheel.Oranges[2][1],
    color_wheel.BlueGreens[2][1],
    color_wheel.Magentas[2][1],
    color_wheel.OrangeYellows[2][1],
    color_wheel.Greens[2][1],
    color_wheel.LtBlues[2][1]
);

color_wheel.Wheel[3] = color_wheel.Wheel[2].concat(
    color_wheel.Blues[3][2],
    color_wheel.Reds[3][2],
    color_wheel.Oranges[3][2],
    color_wheel.BlueGreens[3][2],
    color_wheel.Magentas[3][2],
    color_wheel.OrangeYellows[3][2],
    color_wheel.Greens[3][2],
    color_wheel.LtBlues[3][2]
);

color_wheel.Wheel[4] = color_wheel.Wheel[3].concat(
    color_wheel.Blues[4][3],
    color_wheel.Reds[4][3],
    color_wheel.Oranges[4][3],
    color_wheel.BlueGreens[4][3],
    color_wheel.Magentas[4][3],
    color_wheel.OrangeYellows[4][3],
    color_wheel.Greens[4][3],
    color_wheel.LtBlues[4][3]
);

color_wheel.Wheel[5] = color_wheel.Wheel[4].concat(
    color_wheel.Blues[5][4],
    color_wheel.Reds[5][4],
    color_wheel.Oranges[5][4],
    color_wheel.BlueGreens[5][4],
    color_wheel.Magentas[5][4],
    color_wheel.OrangeYellows[5][4],
    color_wheel.Greens[5][4],
    color_wheel.LtBlues[5][4]
);
