import { CSVLink } from "react-csv";
import styled from "styled-components";

interface SmallDescriptionWrapperProps {
  smallerMargin?: boolean;
}

export const StatisticsWrapper = styled.div<SmallDescriptionWrapperProps>`
  display: inline-flex;
  flex-direction: column;
  margin: ${(props) => (props.smallerMargin ? "0 0.5em 1em 1em" : "1em")};

  justify-content: flex-start;
  line-height: 1;
  align-items: center;
`;

interface SmallDescriptionProps {
  capitalize?: boolean;
}

export const StatisticsName = styled.span<SmallDescriptionProps>`
  font-size: 0.8em;
  font-weight: bold;
  text-transform: ${(props) => (props.capitalize ? "capitalize" : "normal")};
`;

export const StatisticsGroupLogo = styled.img`
  object-fit: scale-down;
  max-height: 2em;
  margin: 0.3em 0;
`;

export const Statistics = styled.div`
  padding: 0.5em;
  display: flex;
  justify-content: center;
  width: 100%;
  flex-wrap: wrap;
`;

export const TableWrapper = styled.div`
  max-width: 100%;
  width: 100%;
`;

// eslint-disable-next-line
//@ts-ignore
export const CSVExport = styled(CSVLink)`
  padding: 1em 0;
  display: block;
  text-align: center;
  border-top: 5px solid #c0392b;
  border-bottom: 1px solid #c0392b;
  width: 100%;
  font-weight: bold;
`;
