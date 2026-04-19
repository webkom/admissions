import { CSVLink } from "react-csv";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const SectionCard = styled.section`
  width: 100%;
  background: #ffffff;
  border: 1px solid #e4e4e4;
  border-radius: 10px;
  padding: 1.25rem 1.5rem;

  ${media.handheld`
    padding: 1rem;
  `}
`;

export const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: 0.3rem;
  font-size: 0.688rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #a0a0a0;
`;

export const SectionTitle = styled.h2`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #111111;
`;

export const SectionDescription = styled.p`
  margin: 0.35rem 0 0;
  max-width: 44rem;
  color: #a0a0a0;
  font-size: 0.813rem;
  line-height: 1.6;
`;

export const GroupFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
  margin-top: 0.875rem;
`;

export const GroupFilterButton = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.875rem;
  border-radius: 8px;
  border: 1px solid
    ${(props) => (props.$selected ? "rgba(178, 18, 7, 0.25)" : "#e4e4e4")};
  background: ${(props) =>
    props.$selected ? "rgba(178, 18, 7, 0.04)" : "#ffffff"};
  color: #111111;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;

  &:hover {
    border-color: ${(props) =>
      props.$selected ? "rgba(178, 18, 7, 0.35)" : "#c8c8c8"};
  }
`;

export const GroupFilterMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
`;

export const GroupFilterLogo = styled.img`
  object-fit: scale-down;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
`;

export const GroupFilterName = styled.span`
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const GroupFilterCount = styled.span`
  flex-shrink: 0;
  color: #a0a0a0;
  font-size: 0.813rem;
  font-weight: 600;
`;

export const TableWrapper = styled.div`
  max-width: 100%;
  width: 100%;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid #e4e4e4;
`;

// eslint-disable-next-line
//@ts-ignore
export const CSVExport = styled(CSVLink)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2.25rem;
  padding: 0 1rem;
  border-radius: 8px;
  background: var(--lego-red-color);
  color: #fff;
  font-size: 0.813rem;
  text-align: center;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s ease;
  border: 1px solid var(--lego-red-color);

  &:hover {
    background: #9a1006;
    border-color: #9a1006;
  }
`;
