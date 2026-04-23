// 简化渐开线齿轮（无MCAD依赖）
teeth = 17;
bore_diameter = 5;
outer_diameter = 20;
thickness = 5;
pressure_angle = 20;

modulus = outer_diameter / (teeth + 2);
pitch_diameter = modulus * teeth;
root_diameter = pitch_diameter - 2.5 * modulus;

// 渐开线函数
function involute(angle) = tan(angle) - angle * PI/180;

// 生成齿形
module gear_tooth(angle) {
    tooth_angle = 360 / teeth;
    // 简化渐开线齿形
    for (i = [0:10]) {
        t = i / 10;
        radius = pitch_diameter/2 + (outer_diameter/2 - pitch_diameter/2) * t;
        rotate([0, 0, angle + tooth_angle * (0.5 * t)])
        translate([radius, 0, 0])
        cube([modulus*0.8, modulus*0.5, thickness], center=true);
    }
}

// 生成完整齿轮
difference() {
    union() {
        cylinder(h=thickness, d=pitch_diameter, $fn=100);
        for (i = [0:teeth-1]) {
            gear_tooth(i * 360/teeth);
        }
    }
    // 中心孔
    cylinder(h=thickness*2, d=bore_diameter, $fn=100, center=true);
}