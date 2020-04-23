// there are line, stepline, stackedline, fullstackedline, spline
const series = require('./scatter_series');
const chartScatterSeries = series.chart;
const polarScatterSeries = series.polar;
const objectUtils = require('../../core/utils/object');
const extend = require('../../core/utils/extend').extend;
const each = require('../../core/utils/iterator').each;
const vizUtils = require('../core/utils');
const mathUtils = require('../../core/utils/math');
const normalizeAngle = vizUtils.normalizeAngle;

const DISCRETE = 'discrete';

const _map = vizUtils.map;

const _extend = extend;
const _each = each;

exports.chart = {};
exports.polar = {};

function clonePoint(point, newX, newY, newAngle) {
    const p = objectUtils.clone(point);
    p.x = newX;
    p.y = newY;
    p.angle = newAngle;
    return p;
}

function getTangentPoint(point, prevPoint, centerPoint, tan, nextStepAngle) {
    const correctAngle = point.angle + nextStepAngle;
    const cosSin = vizUtils.getCosAndSin(correctAngle);
    const x = centerPoint.x + (point.radius + tan * nextStepAngle) * cosSin.cos;
    const y = centerPoint.y - (point.radius + tan * nextStepAngle) * cosSin.sin;

    return clonePoint(prevPoint, x, y, correctAngle);
}

function obtainCubicBezierTCoef(p, p0, p1, p2, p3) {
    const d = p0 - p;
    const c = 3 * p1 - 3 * p0;
    const b = 3 * p2 - 6 * p1 + 3 * p0;
    const a = p3 - 3 * p2 + 3 * p1 - p0;

    return mathUtils.solveCubicEquation(a, b, c, d);
}

const lineMethods = {
    autoHidePointMarkersEnabled() {
        return true;
    },

    _applyGroupSettings: function(style, settings, group) {
        const that = this;
        settings = _extend(settings, style);
        that._applyElementsClipRect(settings);
        group.attr(settings);
    },

    _setGroupsSettings: function(animationEnabled) {
        const that = this;
        const style = that._styles.normal;

        that._applyGroupSettings(style.elements, { 'class': 'dxc-elements' }, that._elementsGroup);
        that._bordersGroup && that._applyGroupSettings(style.border, { 'class': 'dxc-borders' }, that._bordersGroup);

        chartScatterSeries._setGroupsSettings.call(that, animationEnabled);
        animationEnabled && that._markersGroup && that._markersGroup.attr({ opacity: 0.001 });
    },

    _createGroups: function() {
        const that = this;
        that._createGroup('_elementsGroup', that, that._group);
        that._areBordersVisible() && that._createGroup('_bordersGroup', that, that._group);
        chartScatterSeries._createGroups.call(that);
    },

    _areBordersVisible: function() {
        return false;
    },

    _getDefaultSegment: function(segment) {
        return {
            line: _map(segment.line || [], function(pt) {
                return pt.getDefaultCoords();
            })
        };
    },

    _prepareSegment: function(points) {
        return { line: points };
    },

    _parseLineOptions: function(options, defaultColor) {
        return {
            stroke: options.color || defaultColor,
            'stroke-width': options.width,
            dashStyle: options.dashStyle || 'solid'
        };
    },

    _parseStyle: function(options, defaultColor) {
        return { elements: this._parseLineOptions(options, defaultColor) };
    },

    _applyStyle: function(style) {
        const that = this;
        that._elementsGroup && that._elementsGroup.attr(style.elements);
        _each(that._graphics || [], function(_, graphic) {
            graphic.line && graphic.line.attr({ 'stroke-width': style.elements['stroke-width'] }).sharp();
        });
    },

    _drawElement: function(segment, group) {
        return { line: this._createMainElement(segment.line, { 'stroke-width': this._styles.normal.elements['stroke-width'] }).append(group) };
    },

    _removeElement: function(element) {
        element.line.remove();
    },

    _updateElement: function(element, segment, animate, animationComplete) {
        const params = { points: segment.line };
        const lineElement = element.line;

        animate ? lineElement.animate(params, {}, animationComplete) : lineElement.attr(params);
    },

    _animateComplete: function() {
        const that = this;
        chartScatterSeries._animateComplete.call(that);
        that._markersGroup && that._markersGroup.animate({ opacity: 1 }, { duration: that._defaultDuration });
    },

    _animate: function() {
        const that = this;
        const lastIndex = that._graphics.length - 1;
        _each(that._graphics || [], function(i, elem) {
            let complete;
            if(i === lastIndex) {
                complete = function() {
                    that._animateComplete();
                };
            }
            that._updateElement(elem, that._segments[i], true, complete);
        });
    },

    _drawPoint: function(options) {
        chartScatterSeries._drawPoint.call(this, { point: options.point, groups: options.groups });
    },

    _createMainElement: function(points, settings) {
        return this._renderer.path(points, 'line').attr(settings);
    },

    _sortPoints: function(points, rotated) {
        return rotated ? points.sort(function(p1, p2) {
            return p2.y - p1.y;
        }) : points.sort(function(p1, p2) {
            return p1.x - p2.x;
        });
    },

    _drawSegment: function(points, animationEnabled, segmentCount, lastSegment) {
        const that = this;
        const rotated = that._options.rotated;
        const forceDefaultSegment = false;
        const segment = that._prepareSegment(points, rotated, lastSegment);

        that._segments.push(segment);
        if(!that._graphics[segmentCount]) {
            that._graphics[segmentCount] = that._drawElement(animationEnabled ? that._getDefaultSegment(segment) : segment, that._elementsGroup);
        } else if(!animationEnabled) {
            that._updateElement(that._graphics[segmentCount], segment);
        } else if(forceDefaultSegment) {
            that._updateElement(that._graphics[segmentCount], that._getDefaultSegment(segment));
        }
    },

    _getTrackerSettings: function() {
        const that = this;
        const defaultTrackerWidth = that._defaultTrackerWidth;
        const strokeWidthFromElements = that._styles.normal.elements['stroke-width'];
        return {
            'stroke-width': strokeWidthFromElements > defaultTrackerWidth ? strokeWidthFromElements : defaultTrackerWidth,
            fill: 'none'
        };
    },

    _getMainPointsFromSegment: function(segment) {
        return segment.line;
    },

    _drawTrackerElement: function(segment) {
        return this._createMainElement(this._getMainPointsFromSegment(segment), this._getTrackerSettings(segment));
    },

    _updateTrackerElement: function(segment, element) {
        const settings = this._getTrackerSettings(segment);
        settings.points = this._getMainPointsFromSegment(segment);
        element.attr(settings);
    },

    checkSeriesViewportCoord(axis, coord) {
        if(this._points.length === 0) {
            return false;
        }
        const range = axis.isArgumentAxis ? this.getArgumentRange() : this.getViewport();
        const min = axis.getTranslator().translate(range.categories ? range.categories[0] : range.min);
        const max = axis.getTranslator().translate(range.categories ? range.categories[range.categories.length - 1] : range.max);
        const rotated = this.getOptions().rotated;
        const inverted = axis.getOptions().inverted;

        return (axis.isArgumentAxis && (!rotated && !inverted || rotated && inverted) ||
            !axis.isArgumentAxis && (rotated && !inverted || !rotated && inverted)) ?
            coord >= min && coord <= max : coord >= max && coord <= min;
    },

    getSeriesPairCoord(coord, isArgument) {
        const that = this;
        let oppositeCoord = null;
        const nearestPoints = this._getNearestPointsByCoord(coord, isArgument);
        const needValueCoord = isArgument && !that._options.rotated || !isArgument && that._options.rotated;

        for(let i = 0; i < nearestPoints.length; i++) {
            const p = nearestPoints[i];
            const k = (p[1].vy - p[0].vy) / (p[1].vx - p[0].vx);
            const b = p[0].vy - p[0].vx * k;
            let tmpCoord;

            if(p[1].vx - p[0].vx === 0) {
                tmpCoord = needValueCoord ? p[0].vy : p[0].vx;
            } else {
                tmpCoord = needValueCoord ? k * coord + b : (coord - b) / k;
            }

            if(this._checkAxisVisibleAreaCoord(!isArgument, tmpCoord)) {
                oppositeCoord = tmpCoord;
                break;
            }
        }

        return oppositeCoord;
    }
};

const lineSeries = exports.chart['line'] = _extend({}, chartScatterSeries, lineMethods, {
    getPointCenterByArg(arg) {
        const value = this.getArgumentAxis().getTranslator().translate(arg);
        return { x: value, y: value };
    }
});

exports.chart['stepline'] = _extend({}, lineSeries, {
    _calculateStepLinePoints(points) {
        const segment = [];
        const coordName = this._options.rotated ? 'x' : 'y';

        _each(points, function(i, pt) {
            let point;

            if(!i) {
                segment.push(pt);
                return;
            }
            const step = segment[segment.length - 1][coordName];
            if(step !== pt[coordName]) {
                point = objectUtils.clone(pt);
                point[coordName] = step;
                segment.push(point);
            }
            segment.push(pt);
        });
        return segment;
    },

    _prepareSegment: function(points) {
        return lineSeries._prepareSegment(this._calculateStepLinePoints(points));
    },

    getSeriesPairCoord(coord, isArgument) {
        let oppositeCoord;
        const rotated = this._options.rotated;
        const isOpposite = !isArgument && !rotated || isArgument && rotated;
        const coordName = !isOpposite ? 'vx' : 'vy';
        const oppositeCoordName = !isOpposite ? 'vy' : 'vx';
        const nearestPoints = this._getNearestPointsByCoord(coord, isArgument);

        for(let i = 0; i < nearestPoints.length; i++) {
            const p = nearestPoints[i];
            let tmpCoord;

            if(isArgument) {
                tmpCoord = coord !== p[1][coordName] ? p[0][oppositeCoordName] : p[1][oppositeCoordName];
            } else {
                tmpCoord = coord === p[0][coordName] ? p[0][oppositeCoordName] : p[1][oppositeCoordName];
            }

            if(this._checkAxisVisibleAreaCoord(!isArgument, tmpCoord)) {
                oppositeCoord = tmpCoord;
                break;
            }
        }

        return oppositeCoord;
    }
});

exports.chart['spline'] = _extend({}, lineSeries, {

    _calculateBezierPoints: function(src, rotated) {
        const bezierPoints = [];
        const pointsCopy = src;
        const checkExtremum = function(otherPointCoord, pointCoord, controlCoord) {
            return ((otherPointCoord > pointCoord && controlCoord > otherPointCoord) || (otherPointCoord < pointCoord && controlCoord < otherPointCoord)) ? otherPointCoord : controlCoord;
        };

        if(pointsCopy.length !== 1) {
            pointsCopy.forEach(function(curPoint, i) {
                let leftControlX; let leftControlY;
                let rightControlX; let rightControlY;
                const prevPoint = pointsCopy[i - 1];
                const nextPoint = pointsCopy[i + 1];
                let x1;
                let x2;
                let y1;
                let y2;
                const lambda = 0.5;
                let a;
                let b;
                let c;
                let xc;
                let yc;
                let shift;

                if(!i || i === pointsCopy.length - 1) {
                    bezierPoints.push(curPoint, curPoint);
                    return;
                }

                const xCur = curPoint.x;
                const yCur = curPoint.y;
                x1 = prevPoint.x;
                x2 = nextPoint.x;
                y1 = prevPoint.y;
                y2 = nextPoint.y;

                // check for extremum
                const curIsExtremum = !!((!rotated && ((yCur <= prevPoint.y && yCur <= nextPoint.y)
                            || (yCur >= prevPoint.y && yCur >= nextPoint.y)))
                        || (rotated && ((xCur <= prevPoint.x && xCur <= nextPoint.x)
                            || (xCur >= prevPoint.x && xCur >= nextPoint.x))));

                if(curIsExtremum) {
                    if(!rotated) {
                        rightControlY = leftControlY = yCur;
                        rightControlX = (xCur + nextPoint.x) / 2;
                        leftControlX = (xCur + prevPoint.x) / 2;
                    } else {
                        rightControlX = leftControlX = xCur;
                        rightControlY = (yCur + nextPoint.y) / 2;
                        leftControlY = (yCur + prevPoint.y) / 2;
                    }
                } else {
                    a = y2 - y1;
                    b = x1 - x2;
                    c = y1 * x2 - x1 * y2;

                    if(!rotated) {
                        if(!b) {
                            bezierPoints.push(curPoint, curPoint, curPoint);
                            return;
                        }
                        xc = xCur;
                        yc = (-1) * (a * xc + c) / b;
                        shift = yc - yCur;
                        y1 -= shift;
                        y2 -= shift;
                    } else {
                        if(!a) {
                            bezierPoints.push(curPoint, curPoint, curPoint);
                            return;
                        }
                        yc = yCur;
                        xc = (-1) * (b * yc + c) / a;
                        shift = xc - xCur;
                        x1 -= shift;
                        x2 -= shift;
                    }
                    rightControlX = (xCur + lambda * x2) / (1 + lambda);
                    rightControlY = (yCur + lambda * y2) / (1 + lambda);

                    leftControlX = (xCur + lambda * x1) / (1 + lambda);
                    leftControlY = (yCur + lambda * y1) / (1 + lambda);
                }

                // check control points for extremum
                if(!rotated) {
                    leftControlY = checkExtremum(prevPoint.y, yCur, leftControlY);
                    rightControlY = checkExtremum(nextPoint.y, yCur, rightControlY);
                } else {
                    leftControlX = checkExtremum(prevPoint.x, xCur, leftControlX);
                    rightControlX = checkExtremum(nextPoint.x, xCur, rightControlX);
                }

                const leftPoint = clonePoint(curPoint, leftControlX, leftControlY);
                const rightPoint = clonePoint(curPoint, rightControlX, rightControlY);

                bezierPoints.push(leftPoint, curPoint, rightPoint);

            });
        } else {
            bezierPoints.push(pointsCopy[0]);
        }
        return bezierPoints;
    },

    _prepareSegment: function(points, rotated) {
        return lineSeries._prepareSegment(this._calculateBezierPoints(points, rotated));
    },

    _createMainElement: function(points, settings) {
        return this._renderer.path(points, 'bezier').attr(settings);
    },


    getSeriesPairCoord(coord, isArgument) {
        const that = this;
        let oppositeCoord = null;
        const isOpposite = !isArgument && !this._options.rotated || isArgument && this._options.rotated;
        const coordName = !isOpposite ? 'vx' : 'vy';
        const bezierCoordName = !isOpposite ? 'x' : 'y';
        const oppositeCoordName = !isOpposite ? 'vy' : 'vx';
        const bezierOppositeCoordName = !isOpposite ? 'y' : 'x';
        const axis = !isArgument ? that.getArgumentAxis() : that.getValueAxis();
        const visibleArea = axis.getVisibleArea();
        const nearestPoints = this._getNearestPointsByCoord(coord, isArgument);

        for(let i = 0; i < nearestPoints.length; i++) {
            const p = nearestPoints[i];
            if(p.length === 1) {
                (visibleArea[0] <= p[0][oppositeCoordName] && visibleArea[1] >= p[0][oppositeCoordName]) && (oppositeCoord = p[0][oppositeCoordName]);
            } else {
                const ts = obtainCubicBezierTCoef(coord, p[0][coordName], p[1][bezierCoordName], p[2][bezierCoordName], p[3][coordName]);

                ts.forEach(t => {
                    if(t >= 0 && t <= 1) {
                        const tmpCoord = Math.pow((1 - t), 3) * p[0][oppositeCoordName] + 3 * Math.pow(1 - t, 2) * t * p[1][bezierOppositeCoordName] +
                            3 * (1 - t) * t * t * p[2][bezierOppositeCoordName] + t * t * t * p[3][oppositeCoordName];
                        if(visibleArea[0] <= tmpCoord && visibleArea[1] >= tmpCoord) {
                            oppositeCoord = tmpCoord;
                        }
                    }
                });
            }

            if(oppositeCoord !== null) {
                break;
            }
        }

        return oppositeCoord;
    },

    _getNearestPoints(point, nextPoint, bezierPoints) {
        const index = bezierPoints.indexOf(point);
        return [point, bezierPoints[index + 1], bezierPoints[index + 2], nextPoint];
    },

    _getBezierPoints() {
        return this._segments.length > 0 ? this._segments.reduce((a, seg) => a.concat(seg.line), []) : [];
    },
});

exports.polar.line = _extend({}, polarScatterSeries, lineMethods, {
    _sortPoints: function(points) {
        return points;
    },

    _prepareSegment: function(points, rotated, lastSegment) {
        let preparedPoints = [];
        const centerPoint = this.getValueAxis().getCenter();
        let i;
        lastSegment && this._closeSegment(points);

        if(this.argumentAxisType !== DISCRETE && this.valueAxisType !== DISCRETE) {
            for(i = 1; i < points.length; i++) {
                preparedPoints = preparedPoints.concat(this._getTangentPoints(points[i], points[i - 1], centerPoint));
            }
            if(!preparedPoints.length) { // T174220
                preparedPoints = points;
            }
        } else {
            return lineSeries._prepareSegment.call(this, points);
        }

        return { line: preparedPoints };
    },

    _getRemainingAngle: function(angle) {
        const normAngle = normalizeAngle(angle);
        return angle >= 0 ? 360 - normAngle : -normAngle;
    },

    _closeSegment: function(points) {
        let point;
        let differenceAngle;

        if(this._segments.length) {
            point = this._segments[0].line[0];
        } else {
            point = clonePoint(points[0], points[0].x, points[0].y, points[0].angle);
        }
        if(points[points.length - 1].angle !== point.angle) {
            if(normalizeAngle(Math.round(points[points.length - 1].angle)) === normalizeAngle(Math.round(point.angle))) {
                point.angle = points[points.length - 1].angle;
            } else {
                differenceAngle = points[points.length - 1].angle - point.angle;
                point.angle = points[points.length - 1].angle + this._getRemainingAngle(differenceAngle);
            }
            points.push(point);
        }
    },

    _getTangentPoints: function(point, prevPoint, centerPoint) {
        let tangentPoints = [];
        const betweenAngle = Math.round(prevPoint.angle - point.angle);
        const tan = (prevPoint.radius - point.radius) / betweenAngle;
        let i;

        if(betweenAngle === 0) {
            tangentPoints = [prevPoint, point];
        } else if(betweenAngle > 0) {
            for(i = betweenAngle; i >= 0; i--) {
                tangentPoints.push(getTangentPoint(point, prevPoint, centerPoint, tan, i));
            }
        } else {
            for(i = 0; i >= betweenAngle; i--) {
                tangentPoints.push(getTangentPoint(point, prevPoint, centerPoint, tan, (betweenAngle - i)));
            }
        }

        return tangentPoints;
    }
});
